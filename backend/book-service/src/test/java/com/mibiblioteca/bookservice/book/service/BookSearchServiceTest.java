package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import com.mibiblioteca.bookservice.book.cover.CoverLifecycle;
import org.mockito.Spy;
import com.mibiblioteca.bookservice.common.exception.InvalidSearchCriteriaException;
import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class BookSearchServiceTest {
    @Mock private CoverLifecycle covers;
    @Spy
    private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();

    @Mock
    private BookRepository bookRepository;

    @InjectMocks
    private BookService bookService;

    @Test
    void shouldFailWhenNoCriteria() {
        BookSearchRequest request = new BookSearchRequest(null, null, null);

        assertThatThrownBy(() -> bookService.search(request, 0, 20, "title", Sort.Direction.ASC)).isInstanceOf(InvalidSearchCriteriaException.class);
    }

    @Test
    void shouldFailWhenIsbnIsCombined() {
        BookSearchRequest request = new BookSearchRequest("clean", null, "9780132350884");

        assertThatThrownBy(() -> bookService.search(request, 0, 20, "title", Sort.Direction.ASC)).isInstanceOf(InvalidSearchCriteriaException.class);
    }

    @Test
    void shouldSearchByNormalizedIsbn() {
        BookSearchRequest request = new BookSearchRequest(null, null, "978-0-13-235088-4");
        PageRequest pageable = PageRequest.of(0, 20, Sort.by("title").and(Sort.by("id")));
        when(bookRepository.findByIsbn("9780132350884", pageable)).thenReturn(Page.empty(pageable));

        bookService.search(request, 0, 20, "title", Sort.Direction.ASC);

        verify(bookRepository).findByIsbn("9780132350884", pageable);
    }

    @ParameterizedTest
    @CsvSource({"title,ASC", "author,DESC", "combined,ASC", "isbn,DESC"})
    void shouldPassPageableForEachFilterAndMapMetadata(String filter, Sort.Direction direction) {
        BookSearchRequest request;
        PageRequest pageable = PageRequest.of(1, 2, Sort.by(direction, "title").and(Sort.by("id")));
        Book book = new Book();
        book.setId(7L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        Page<Book> books = new PageImpl<>(List.of(book), pageable, 5);

        switch (filter) {
            case "title" -> {
                request = new BookSearchRequest(" clean ", "  ", null);
                when(bookRepository.findByTitleContainingIgnoreCase("clean", pageable)).thenReturn(books);
            }
            case "author" -> {
                request = new BookSearchRequest("  ", " martin ", null);
                when(bookRepository.findByAuthorContainingIgnoreCase("martin", pageable)).thenReturn(books);
            }
            case "combined" -> {
                request = new BookSearchRequest(" clean ", " martin ", null);
                when(bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase("clean", "martin", pageable))
                    .thenReturn(books);
            }
            default -> {
                request = new BookSearchRequest(null, null, "978-0-13-235088-4");
                when(bookRepository.findByIsbn("9780132350884", pageable)).thenReturn(books);
            }
        }

        var response = bookService.search(request, 1, 2, "title", direction);

        assertThat(response.content()).hasSize(1);
        assertThat(response.content().getFirst().id()).isEqualTo(7L);
        assertThat(response.content().getFirst().title()).isEqualTo("Clean Code");
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5);
        assertThat(response.totalPages()).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "title", "author", "createdAt", "updatedAt", "readingStatus", "rating", "startedOn", "finishedOn"})
    void shouldAcceptWhitelistAndUseStableSort(String sortBy) {
        Sort sort = Sort.by(Sort.Direction.DESC, sortBy);
        if (!"id".equals(sortBy)) {
            sort = sort.and(Sort.by("id"));
        }
        PageRequest pageable = PageRequest.of(0, 20, sort);
        when(bookRepository.findByTitleContainingIgnoreCase("clean", pageable)).thenReturn(Page.empty(pageable));

        bookService.search(new BookSearchRequest("clean", null, null), 0, 20, sortBy, Sort.Direction.DESC);

        verify(bookRepository).findByTitleContainingIgnoreCase("clean", pageable);
    }

    @ParameterizedTest
    @CsvSource({"title", "isbn"})
    void shouldRejectInvalidSortAlsoForIsbn(String filter) {
        BookSearchRequest request = "isbn".equals(filter)
            ? new BookSearchRequest(null, null, "9780132350884")
            : new BookSearchRequest("clean", null, null);
        assertThatThrownBy(() -> bookService.search(request, 0, 20, "description", Sort.Direction.ASC))
            .isInstanceOf(InvalidSortParameterException.class);
        verifyNoInteractions(bookRepository);
    }

    @Test
    void shouldReturnEmptyPageWithoutResults() {
        PageRequest pageable = PageRequest.of(0, 20, Sort.by("title").and(Sort.by("id")));
        when(bookRepository.findByTitleContainingIgnoreCase("missing", pageable)).thenReturn(Page.empty(pageable));

        var response = bookService.search(new BookSearchRequest("missing", null, null), 0, 20, "title", Sort.Direction.ASC);

        assertThat(response.content()).isEmpty();
        assertThat(response.page()).isZero();
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isZero();
        assertThat(response.totalPages()).isZero();
    }

    @Test
    void shouldReturnEmptyOutOfRangePageWithRealTotals() {
        when(bookRepository.findByIsbn(eq("9780132350884"), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(1, 20), 1));

        var response = bookService.search(new BookSearchRequest(null, null, "9780132350884"), 1, 20, "title", Sort.Direction.ASC);

        assertThat(response.content()).isEmpty();
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.totalPages()).isEqualTo(1);
    }

    @Test
    void shouldNormalizeIsbnSpacesAndLowercaseX() {
        PageRequest pageable = PageRequest.of(0, 20, Sort.by("title").and(Sort.by("id")));
        when(bookRepository.findByIsbn("080442957X", pageable)).thenReturn(Page.empty(pageable));

        bookService.search(new BookSearchRequest(null, null, "0 8044 2957 x"), 0, 20, "title", Sort.Direction.ASC);

        verify(bookRepository).findByIsbn("080442957X", pageable);
    }

    @Test
    void shouldRejectBlankCriteria() {
        assertThatThrownBy(() -> bookService.search(new BookSearchRequest(" ", " ", null), 0, 20, "title", Sort.Direction.ASC))
            .isInstanceOf(InvalidSearchCriteriaException.class);
        verifyNoInteractions(bookRepository);
    }

    @Test
    void shouldRejectIsbnCombinedWithAuthor() {
        assertThatThrownBy(() -> bookService.search(new BookSearchRequest(null, "martin", "9780132350884"), 0, 20, "title", Sort.Direction.ASC))
            .isInstanceOf(InvalidSearchCriteriaException.class);
        verifyNoInteractions(bookRepository);
    }
}

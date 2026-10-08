package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import com.mibiblioteca.bookservice.book.cover.CoverLifecycle;
import org.mockito.Spy;
import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class BookPaginationServiceTest {
    @Mock private CoverLifecycle covers;
    @Spy
    private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @Test
    void findAllShouldReturnPageAndStableSort() {
        Book book = new Book();
        book.setId(1L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        when(bookRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(book), PageRequest.of(1, 2), 5));

        var response = bookService.findAll(1, 2, "title", Sort.Direction.DESC);

        ArgumentCaptor<PageRequest> pageable = ArgumentCaptor.forClass(PageRequest.class);
        org.mockito.Mockito.verify(bookRepository).findAll(pageable.capture());
        assertThat(pageable.getValue().getSort()).containsExactly(Sort.Order.desc("title"), Sort.Order.asc("id"));
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5);
        assertThat(response.totalPages()).isEqualTo(3);
    }

    @Test
    void findAllShouldNotDuplicateIdSort() {
        when(bookRepository.findAll(any(PageRequest.class))).thenReturn(Page.empty());

        bookService.findAll(0, 20, "id", Sort.Direction.DESC);

        ArgumentCaptor<PageRequest> pageable = ArgumentCaptor.forClass(PageRequest.class);
        org.mockito.Mockito.verify(bookRepository).findAll(pageable.capture());
        assertThat(pageable.getValue().getSort()).containsExactly(Sort.Order.desc("id"));
    }

    @Test
    void findAllShouldRejectUnsupportedSortBy() {
        assertThatThrownBy(() -> bookService.findAll(0, 20, "description", Sort.Direction.ASC))
            .isInstanceOf(InvalidSortParameterException.class);
    }
}

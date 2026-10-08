package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class BookMetadataServiceTest {
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @Test
    void shouldNormalizeCreateReplaceAndClearMetadata() {
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> invocation.getArgument(0));
        BookResponse created = bookService.create(request(" Minotauro ", 2001, 480, "ES", List.of(" Fantasía ", "Aventura")));
        assertThat(created.publisher()).isEqualTo("Minotauro");
        assertThat(created.publicationYear()).isEqualTo(2001);
        assertThat(created.pageCount()).isEqualTo(480);
        assertThat(created.language()).isEqualTo("es");
        assertThat(created.genres()).containsExactly("Fantasía", "Aventura");

        Book existing = new Book();
        when(bookRepository.findById(1L)).thenReturn(Optional.of(existing));
        BookResponse replaced = bookService.update(1L, request(" Publisher ", 2020, 300, "EN", List.of(" Historia ")));
        assertThat(replaced.publisher()).isEqualTo("Publisher");
        assertThat(replaced.publicationYear()).isEqualTo(2020);
        assertThat(replaced.pageCount()).isEqualTo(300);
        assertThat(replaced.language()).isEqualTo("en");
        assertThat(replaced.genres()).containsExactly("Historia");

        BookResponse cleared = bookService.update(1L, request("   ", null, null, null, null));
        assertThat(cleared.publisher()).isNull();
        assertThat(cleared.publicationYear()).isNull();
        assertThat(cleared.pageCount()).isNull();
        assertThat(cleared.language()).isNull();
        assertThat(cleared.genres()).isEmpty();
    }

    @Test
    void shouldMapMetadataInIdListAndSearchResponses() {
        Book book = new Book();
        book.setPublisher("Minotauro");
        book.setPublicationYear(2001);
        book.setPageCount(480);
        book.setLanguage("es");
        book.setGenres(List.of("Fantasía", "Aventura"));
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        var page = new PageImpl<>(List.of(book), PageRequest.of(0, 20), 1);
        when(bookRepository.findAll(any(PageRequest.class))).thenReturn(page);
        when(bookRepository.findByTitleContainingIgnoreCase(any(), any())).thenReturn(page);

        List<BookResponse> responses = List.of(bookService.findById(1L),
            bookService.findAll(0, 20, "title", Sort.Direction.ASC).content().getFirst(),
            bookService.search(new BookSearchRequest("book", null, null), 0, 20, "title", Sort.Direction.ASC).content().getFirst());
        for (BookResponse response : responses) {
            assertThat(response.publisher()).isEqualTo("Minotauro");
            assertThat(response.publicationYear()).isEqualTo(2001);
            assertThat(response.pageCount()).isEqualTo(480);
            assertThat(response.language()).isEqualTo("es");
            assertThat(response.genres()).containsExactly("Fantasía", "Aventura");
        }
        book.getGenres().clear();
        assertThat(responses.getFirst().genres()).containsExactly("Fantasía", "Aventura");
    }

    private BookRequest request(String publisher, Integer year, Integer pages, String language, List<String> genres) {
        return new BookRequest("Book", "Author", null, null, null, publisher, year, pages, language, genres);
    }
}

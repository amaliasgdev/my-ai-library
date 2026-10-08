package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import org.mockito.Spy;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import com.mibiblioteca.bookservice.common.exception.DuplicateIsbnException;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BookServiceTest {
    @Spy
    private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();

    @Mock
    private BookRepository bookRepository;

    @InjectMocks
    private BookService bookService;

    @Test
    void createShouldSaveBook() {
        BookRequest request = new BookRequest("Clean Code", "Robert C. Martin", "978-0132350884", "A classic", null, null, null, null, null, null);
        when(bookRepository.existsByIsbn("9780132350884")).thenReturn(false);
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> {
            Book b = invocation.getArgument(0);
            b.setId(1L);
            b.setCreatedAt(Instant.now());
            b.setUpdatedAt(Instant.now());
            return b;
        });

        BookResponse response = bookService.create(request);

        assertThat(response.id()).isEqualTo(1L);
        assertThat(response.title()).isEqualTo("Clean Code");
        assertThat(response.author()).isEqualTo("Robert C. Martin");
        assertThat(response.isbn()).isEqualTo("9780132350884");
    }

    @Test
    void createShouldFailWhenIsbnExists() {
        BookRequest request = new BookRequest("Clean Code", "Robert C. Martin", "9780132350884", null, null, null, null, null, null, null);
        when(bookRepository.existsByIsbn("9780132350884")).thenReturn(true);

        assertThatThrownBy(() -> bookService.create(request)).isInstanceOf(DuplicateIsbnException.class);
    }

    @Test
    void findByIdShouldFailWhenMissing() {
        when(bookRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookService.findById(99L)).isInstanceOf(BookNotFoundException.class);
    }
}

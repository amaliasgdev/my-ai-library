package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.dto.UpdateRatingRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RatingServiceTest {
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @Test
    void updateRatingShouldSetRating() {
        Book book = book();
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(bookRepository.save(book)).thenReturn(book);

        var response = bookService.updateRating(1L, new UpdateRatingRequest(4));

        assertThat(response.rating()).isEqualTo(4);
    }

    @Test
    void clearRatingShouldSetRatingToNull() {
        Book book = book();
        book.setRating(4);
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(bookRepository.save(book)).thenReturn(book);

        bookService.clearRating(1L);

        assertThat(book.getRating()).isNull();
    }

    private Book book() {
        Book book = new Book();
        book.setId(1L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        book.setCreatedAt(Instant.now());
        book.setUpdatedAt(Instant.now());
        return book;
    }
}

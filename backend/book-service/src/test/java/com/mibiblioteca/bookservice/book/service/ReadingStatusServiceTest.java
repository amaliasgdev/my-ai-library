package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingStatusRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import com.mibiblioteca.bookservice.book.cover.CoverLifecycle;
import org.mockito.Spy;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReadingStatusServiceTest {
    @Mock private CoverLifecycle covers;
    @Spy
    private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @Test
    void updateReadingStatusShouldUpdateBook() {
        Book book = new Book();
        book.setId(1L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        book.setCreatedAt(Instant.now());
        book.setUpdatedAt(Instant.now());
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(bookRepository.save(book)).thenReturn(book);

        var response = bookService.updateReadingStatus(1L, new UpdateReadingStatusRequest(ReadingStatus.READING));

        assertThat(response.readingStatus()).isEqualTo(ReadingStatus.READING);
    }
}

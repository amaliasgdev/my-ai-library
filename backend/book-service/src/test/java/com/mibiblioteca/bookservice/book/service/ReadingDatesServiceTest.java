package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.ReadingDateRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingDatesRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import com.mibiblioteca.bookservice.book.cover.CoverLifecycle;
import org.mockito.Spy;
import com.mibiblioteca.bookservice.common.exception.InvalidReadingDatesException;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReadingDatesServiceTest {
    @Mock private CoverLifecycle covers;
    @Spy
    private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @Test
    void startReadingShouldSetDateAndStatus() {
        Book book = book(ReadingStatus.TO_READ);
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(bookRepository.save(book)).thenReturn(book);

        var response = bookService.startReading(1L, new ReadingDateRequest(LocalDate.of(2026, 10, 4)));

        assertThat(response.startedOn()).isEqualTo(LocalDate.of(2026, 10, 4));
        assertThat(response.readingStatus()).isEqualTo(ReadingStatus.READING);
    }

    @Test
    void finishReadingShouldRejectDateBeforeStart() {
        Book book = book(ReadingStatus.READING);
        book.setStartedOn(LocalDate.of(2026, 10, 4));
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));

        assertThatThrownBy(() -> bookService.finishReading(1L, new ReadingDateRequest(LocalDate.of(2026, 10, 3))))
            .isInstanceOf(InvalidReadingDatesException.class);
    }

    @Test
    void updateReadingDatesShouldRejectEmptyRequest() {
        assertThatThrownBy(() -> bookService.updateReadingDates(1L, new UpdateReadingDatesRequest(null, null)))
            .isInstanceOf(InvalidReadingDatesException.class);
    }

    private Book book(ReadingStatus status) {
        Book book = new Book();
        book.setId(1L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        book.setReadingStatus(status);
        return book;
    }
}

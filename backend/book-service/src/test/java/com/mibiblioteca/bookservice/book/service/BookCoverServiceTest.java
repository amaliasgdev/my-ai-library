package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class BookCoverServiceTest {
    @Mock private BookRepository bookRepository;
    @InjectMocks private BookService bookService;

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"https://example.com/covers/clean-code.jpg"})
    void shouldCreateBookWithOptionalCover(String coverUrl) {
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = bookService.create(new BookRequest("Clean Code", "Robert C. Martin", null, null, coverUrl, null, null, null, null, null));

        ArgumentCaptor<Book> saved = ArgumentCaptor.forClass(Book.class);
        verify(bookRepository).save(saved.capture());
        assertThat(saved.getValue().getCoverUrl()).isEqualTo(coverUrl);
        assertThat(response.coverUrl()).isEqualTo(coverUrl);
        assertThat(response.readingStatus()).isEqualTo(ReadingStatus.TO_READ);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"https://example.com/new-cover.jpg"})
    void shouldReplaceOrClearCoverWithoutChangingReadingData(String coverUrl) {
        Book book = bookWithCover();
        book.setReadingStatus(ReadingStatus.READ);
        book.setRating(5);
        book.setStartedOn(LocalDate.of(2026, 10, 1));
        book.setFinishedOn(LocalDate.of(2026, 10, 7));
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(bookRepository.save(book)).thenReturn(book);

        var response = bookService.update(1L, new BookRequest("Clean Code", "Robert C. Martin", null, null, coverUrl, null, null, null, null, null));

        assertThat(book.getCoverUrl()).isEqualTo(coverUrl);
        assertThat(response.coverUrl()).isEqualTo(coverUrl);
        assertThat(response.readingStatus()).isEqualTo(ReadingStatus.READ);
        assertThat(response.rating()).isEqualTo(5);
        assertThat(response.startedOn()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(response.finishedOn()).isEqualTo(LocalDate.of(2026, 10, 7));
    }

    @Test
    void shouldIncludeCoverInIdListAndSearchResponses() {
        Book book = bookWithCover();
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        PageImpl<Book> page = new PageImpl<>(List.of(book), PageRequest.of(0, 20), 1);
        when(bookRepository.findAll(any(PageRequest.class))).thenReturn(page);
        when(bookRepository.findByTitleContainingIgnoreCase(any(), any())).thenReturn(page);

        assertThat(bookService.findById(1L).coverUrl()).isEqualTo(book.getCoverUrl());
        assertThat(bookService.findAll(0, 20, "title", Sort.Direction.ASC).content().getFirst().coverUrl())
            .isEqualTo(book.getCoverUrl());
        assertThat(bookService.search(new BookSearchRequest("clean", null, null), 0, 20, "title", Sort.Direction.ASC)
            .content().getFirst().coverUrl()).isEqualTo(book.getCoverUrl());
    }

    private Book bookWithCover() {
        Book book = new Book();
        book.setId(1L);
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        book.setCoverUrl("https://example.com/old-cover.jpg");
        return book;
    }
}

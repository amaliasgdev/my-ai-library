package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.common.exception.InvalidSearchCriteriaException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BookSearchServiceTest {

    @Mock
    private BookRepository bookRepository;

    @InjectMocks
    private BookService bookService;

    @Test
    void shouldFailWhenNoCriteria() {
        BookSearchRequest request = new BookSearchRequest(null, null, null);

        assertThatThrownBy(() -> bookService.search(request)).isInstanceOf(InvalidSearchCriteriaException.class);
    }

    @Test
    void shouldFailWhenIsbnIsCombined() {
        BookSearchRequest request = new BookSearchRequest("clean", null, "9780132350884");

        assertThatThrownBy(() -> bookService.search(request)).isInstanceOf(InvalidSearchCriteriaException.class);
    }

    @Test
    void shouldSearchByNormalizedIsbn() {
        BookSearchRequest request = new BookSearchRequest(null, null, "978-0-13-235088-4");
        when(bookRepository.findByIsbn("9780132350884")).thenReturn(List.of());

        bookService.search(request);

        verify(bookRepository).findByIsbn("9780132350884");
    }
}

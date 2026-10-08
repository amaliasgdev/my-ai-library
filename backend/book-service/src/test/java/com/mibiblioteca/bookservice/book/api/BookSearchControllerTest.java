package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.dto.BookPageResponse;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.common.exception.InvalidSearchCriteriaException;
import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@WebMvcTest(BookController.class)
class BookSearchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BookService bookService;

    @Test
    void searchShouldReturn200() throws Exception {
        when(bookService.search(any(), eq(0), eq(20), eq("title"), eq(Sort.Direction.ASC)))
            .thenReturn(new BookPageResponse(
                List.of(new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.TO_READ, null, null, null)),
                0,
                20,
                1,
                1
            ));

        mockMvc.perform(get("/api/books/search").param("title", "clean"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].id").value(1))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.totalPages").value(1));
        verify(bookService).search(new BookSearchRequest("clean", null, null), 0, 20, "title", Sort.Direction.ASC);
    }

    @Test
    void searchShouldReturn400WhenNoCriteria() throws Exception {
        when(bookService.search(any(), anyInt(), anyInt(), anyString(), any()))
            .thenThrow(new InvalidSearchCriteriaException("At least one search criterion is required"));

        mockMvc.perform(get("/api/books/search")).andExpect(status().isBadRequest());
    }

    @Test
    void searchShouldReturn400ForInvalidIsbn() throws Exception {
        mockMvc.perform(get("/api/books/search").param("isbn", "bad-isbn"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.errors.isbn").value("isbn must be a valid ISBN-10 or ISBN-13"))
            .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(HandlerMethodValidationException.class));
        verifyNoInteractions(bookService);
    }

    @Test
    void shouldForwardCustomParametersAndCombinedFilters() throws Exception {
        BookSearchRequest request = new BookSearchRequest("clean", "martin", null);
        when(bookService.search(request, 1, 2, "author", Sort.Direction.DESC))
            .thenReturn(new BookPageResponse(List.of(), 1, 2, 2, 1));

        mockMvc.perform(get("/api/books/search").param("title", "clean").param("author", "martin")
                .param("page", "1").param("size", "2").param("sortBy", "author").param("direction", "DESC"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isEmpty())
            .andExpect(jsonPath("$.page").value(1))
            .andExpect(jsonPath("$.size").value(2))
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.totalPages").value(1));
        verify(bookService).search(request, 1, 2, "author", Sort.Direction.DESC);
    }

    @ParameterizedTest
    @CsvSource({"title,missing", "author,missing", "isbn,9780132350884"})
    void shouldReturnEmptyPageForEachFilter(String filter, String value) throws Exception {
        when(bookService.search(any(), eq(0), eq(20), eq("title"), eq(Sort.Direction.ASC)))
            .thenReturn(new BookPageResponse(List.of(), 0, 20, 0, 0));
        mockMvc.perform(get("/api/books/search").param(filter, value))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0))
            .andExpect(jsonPath("$.totalPages").value(0));
    }

    @ParameterizedTest
    @CsvSource({"page,-1", "size,0", "size,101"})
    void shouldRejectPaginationAlsoForIsbn(String parameter, String value) throws Exception {
        mockMvc.perform(get("/api/books/search").param("isbn", "9780132350884").param(parameter, value))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.errors." + parameter).isNotEmpty())
            .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(HandlerMethodValidationException.class));
        verifyNoInteractions(bookService);
    }

    @ParameterizedTest
    @CsvSource({"page,abc", "size,abc", "direction,SIDEWAYS", "direction,asc"})
    void shouldRejectTypeMismatchAlsoForIsbn(String parameter, String value) throws Exception {
        mockMvc.perform(get("/api/books/search").param("isbn", "9780132350884").param(parameter, value))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(MethodArgumentTypeMismatchException.class));
        verifyNoInteractions(bookService);
    }

    @Test
    void shouldRejectUnsupportedSortBy() throws Exception {
        when(bookService.search(any(), anyInt(), anyInt(), eq("description"), any()))
            .thenThrow(new InvalidSortParameterException("description"));
        mockMvc.perform(get("/api/books/search").param("isbn", "9780132350884").param("sortBy", "description"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Invalid sort parameter"));
    }

    @ParameterizedTest
    @CsvSource({"title,clean", "author,martin"})
    void shouldRejectIsbnCombinedWithOtherFilter(String filter, String value) throws Exception {
        when(bookService.search(any(), anyInt(), anyInt(), anyString(), any()))
            .thenThrow(new InvalidSearchCriteriaException("isbn cannot be combined with title or author"));
        mockMvc.perform(get("/api/books/search").param("isbn", "9780132350884").param(filter, value))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detail").value("isbn cannot be combined with title or author"));
    }

    @Test
    void shouldKeepFieldErrorsWhenIsbnAndPageAreInvalid() throws Exception {
        mockMvc.perform(get("/api/books/search").param("isbn", "bad-isbn").param("page", "-1"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.isbn").value("isbn must be a valid ISBN-10 or ISBN-13"))
            .andExpect(jsonPath("$.errors.page").isNotEmpty())
            .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(HandlerMethodValidationException.class));
    }

    @ParameterizedTest
    @CsvSource({"title", "author"})
    void shouldKeepErrorsForOversizedFilters(String filter) throws Exception {
        mockMvc.perform(get("/api/books/search").param(filter, "a".repeat(256)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors." + filter).isNotEmpty())
            .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(HandlerMethodValidationException.class));
        verifyNoInteractions(bookService);
    }
}

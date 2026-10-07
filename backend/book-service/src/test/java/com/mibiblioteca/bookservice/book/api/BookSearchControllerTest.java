package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.common.exception.InvalidSearchCriteriaException;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookController.class)
class BookSearchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BookService bookService;

    @Test
    void searchShouldReturn200() throws Exception {
        when(bookService.search(any()))
            .thenReturn(List.of(new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.TO_READ, null, null, null)));

        mockMvc.perform(get("/api/books/search").param("title", "clean")).andExpect(status().isOk());
    }

    @Test
    void searchShouldReturn400WhenNoCriteria() throws Exception {
        when(bookService.search(any())).thenThrow(new InvalidSearchCriteriaException("At least one search criterion is required"));

        mockMvc.perform(get("/api/books/search")).andExpect(status().isBadRequest());
    }

    @Test
    void searchShouldReturn400ForInvalidIsbn() throws Exception {
        mockMvc.perform(get("/api/books/search").param("isbn", "bad-isbn")).andExpect(status().isBadRequest());
    }
}

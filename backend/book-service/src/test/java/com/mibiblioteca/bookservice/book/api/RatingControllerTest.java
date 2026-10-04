package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookController.class)
class RatingControllerTest {
    @Autowired private MockMvc mockMvc;
    @MockBean private BookService bookService;

    @Test
    void updateRatingShouldReturn200() throws Exception {
        when(bookService.updateRating(eq(1L), any()))
            .thenReturn(new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.TO_READ, 5));

        mockMvc.perform(put("/api/books/1/rating").contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rating").value(5));
    }

    @Test
    void updateRatingShouldReturn400ForDecimal() throws Exception {
        mockMvc.perform(put("/api/books/1/rating").contentType(MediaType.APPLICATION_JSON).content("{\"rating\":4.5}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void clearRatingShouldReturn204() throws Exception {
        doNothing().when(bookService).clearRating(1L);
        mockMvc.perform(delete("/api/books/1/rating")).andExpect(status().isNoContent());
    }
}

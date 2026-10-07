package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
class ReadingStatusControllerTest {
    @Autowired private MockMvc mockMvc;
    @MockBean private BookService bookService;

    @Test
    void patchReadingStatusShouldReturn200() throws Exception {
        when(bookService.updateReadingStatus(eq(1L), any()))
            .thenReturn(new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.READING, null, null, null));

        mockMvc.perform(patch("/api/books/1/reading-status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"readingStatus\":\"READING\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.readingStatus").value("READING"));
    }

    @Test
    void patchReadingStatusShouldReturn400ForInvalidStatus() throws Exception {
        mockMvc.perform(patch("/api/books/1/reading-status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"readingStatus\":\"INVALID\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Invalid request body"));
    }
}

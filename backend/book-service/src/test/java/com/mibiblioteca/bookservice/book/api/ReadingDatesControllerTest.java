package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookController.class)
class ReadingDatesControllerTest {
    @Autowired private MockMvc mockMvc;
    @MockBean private BookService bookService;

    @Test
    void startReadingShouldReturn200() throws Exception {
        when(bookService.startReading(eq(1L), any()))
            .thenReturn(response(LocalDate.of(2026, 10, 4), null, ReadingStatus.READING));

        mockMvc.perform(post("/api/books/1/start-reading").contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2026-10-04\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.startedOn").value("2026-10-04"));
    }

    @Test
    void startReadingShouldReturn400WithoutDate() throws Exception {
        mockMvc.perform(post("/api/books/1/start-reading").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void clearReadingDatesShouldReturn204() throws Exception {
        doNothing().when(bookService).clearReadingDates(1L);
        mockMvc.perform(delete("/api/books/1/reading-dates")).andExpect(status().isNoContent());
    }

    private BookResponse response(LocalDate startedOn, LocalDate finishedOn, ReadingStatus status) {
        return new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), status, null, startedOn, finishedOn, null);
    }
}

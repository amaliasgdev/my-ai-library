package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookController.class)
class BookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BookService bookService;

    @Test
    void createShouldReturn201() throws Exception {
        BookResponse response = new BookResponse(
            1L,
            "Clean Code",
            "Robert C. Martin",
            "9780132350884",
            "A classic",
            Instant.now(),
            Instant.now(),
            ReadingStatus.TO_READ,
            null,
            null,
            null
        );
        when(bookService.create(any(BookRequest.class))).thenReturn(response);

        mockMvc
            .perform(
                post("/api/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """
                        {
                          "title": "Clean Code",
                          "author": "Robert C. Martin",
                          "isbn": "978-0132350884",
                          "description": "A classic"
                        }
                        """
                    )
            )
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", "/api/books/1"))
            .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    void createShouldReturn400WhenInvalid() throws Exception {
        mockMvc
            .perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void getByIdShouldReturn404WhenMissing() throws Exception {
        when(bookService.findById(99L)).thenThrow(new BookNotFoundException(99L));

        mockMvc.perform(get("/api/books/99")).andExpect(status().isNotFound());
    }

    @Test
    void getAllShouldReturn200() throws Exception {
        when(bookService.findAll())
            .thenReturn(List.of(new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.TO_READ, null, null, null)));

        mockMvc.perform(get("/api/books")).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void updateShouldReturn200() throws Exception {
        BookResponse response = new BookResponse(1L, "Clean Architecture", "Robert C. Martin", null, null, Instant.now(), Instant.now(), ReadingStatus.TO_READ, null, null, null);
        when(bookService.update(eq(1L), any(BookRequest.class))).thenReturn(response);

        mockMvc
            .perform(
                put("/api/books/1")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """
                        {
                          "title": "Clean Architecture",
                          "author": "Robert C. Martin",
                          "isbn": null,
                          "description": null
                        }
                        """
                    )
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Clean Architecture"));
    }

    @Test
    void deleteShouldReturn204() throws Exception {
        doNothing().when(bookService).delete(1L);

        mockMvc.perform(delete("/api/books/1")).andExpect(status().isNoContent());
    }
}

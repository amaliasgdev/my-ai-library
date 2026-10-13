package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Import(BookIsbnConstraintConflictTest.OtherConstraintController.class)
class BookIsbnConstraintConflictTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @MockitoSpyBean private BookRepository repository;

    @Test
    void realUniqueIndexViolationAfterMissedPrecheckReturns409() throws Exception {
        assertThat(jdbc.queryForObject("show server_version", String.class)).startsWith("16.");
        String isbn = "978" + String.format("%010d", System.nanoTime() % 10_000_000_000L);
        Book existing = new Book(); existing.setTitle("Existing"); existing.setAuthor("Author"); existing.setIsbn(isbn);
        repository.saveAndFlush(existing);
        // Simulate the stale precheck in a race; the INSERT and PostgreSQL constraint remain real.
        doReturn(false).when(repository).existsByIsbn(isbn);
        mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"New\",\"author\":\"Author\",\"isbn\":\"" + isbn + "\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.title").value("Duplicate ISBN"))
            .andExpect(jsonPath("$.errors.isbn").exists());
    }

    @Test
    void unrelatedRealIntegrityViolationStillReturns500() throws Exception {
        mvc.perform(get("/__test/other-constraint")).andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.detail").value("Database operation failed"))
            .andExpect(jsonPath("$.errors.isbn").doesNotExist());
    }

    @RestController
    static class OtherConstraintController {
        private final BookRepository repository;
        OtherConstraintController(BookRepository repository) { this.repository = repository; }
        @GetMapping("/__test/other-constraint")
        void violate() {
            Book invalid = new Book(); invalid.setTitle("Invalid rating"); invalid.setAuthor("Author"); invalid.setRating(6);
            repository.saveAndFlush(invalid);
        }
    }
}

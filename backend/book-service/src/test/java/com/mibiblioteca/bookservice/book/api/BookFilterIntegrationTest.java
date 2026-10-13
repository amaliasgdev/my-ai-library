package com.mibiblioteca.bookservice.book.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookFilterIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private BookRepository repository;

    @BeforeEach void seed() {
        repository.deleteAll();
        for (int i = 0; i < 3; i++) {
            Book book = new Book(); book.setTitle("Book " + i); book.setAuthor("Author");
            book.setRating(i == 2 ? null : 4); book.setPublicationYear(i == 2 ? null : 2020);
            book.setReadingStatus(i == 0 ? ReadingStatus.READ : ReadingStatus.READING);
            book.setGenres(List.of("Terror")); book.setLanguage("es"); book.setPublisher("Press");
            book.setIsbn(i == 0 ? "9780306406157" : null); repository.saveAndFlush(book);
        }
    }
    @ParameterizedTest @ValueSource(strings = {"/api/books", "/api/books/search"})
    void filtersComposeAcrossControllerServiceAndPostgresWithRealTotals(String path) throws Exception {
        mvc.perform(get(path).param("title", "book").param("author", "author").param("readingStatus", "READ", "READING")
            .param("ratingMin", "4").param("yearFrom", "2020").param("yearTo", "2020").param("genre", "tERROR")
            .param("language", "ES").param("publisher", "REss").param("page", "1").param("size", "1").param("direction", "DESC"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.page").value(1)).andExpect(jsonPath("$.content[0].title").value("Book 0"));
    }
    @Test void isbnSearchCombinesWithFiltersWithoutRequiringLookupChecksum() throws Exception {
        mvc.perform(get("/api/books/search").param("isbn", "978-0-306-40615-7").param("genre", "Terror").param("ratingMin", "4"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].title").value("Book 0"));
    }
    @Test void filtersAloneCannotReplaceSearchAndIsbnRemainsExclusive() throws Exception {
        mvc.perform(get("/api/books/search").param("genre", "Terror")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/search").param("isbn", "9780306406157").param("title", "Book").param("genre", "Terror")).andExpect(status().isBadRequest());
    }
    @Test void noFiltersKeepsExistingListDefaults() throws Exception {
        mvc.perform(get("/api/books")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
            .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20)).andExpect(jsonPath("$.content[0].title").value("Book 0"));
    }
}

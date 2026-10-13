package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookLocationIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private BookRepository repository;

    private Map<String, Object> request() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("title", "Location book"); data.put("author", "Author");
        return data;
    }

    private JsonNode create(Map<String, Object> data) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(data))).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString());
    }

    @Test void completeLocationIsNormalizedWithoutRepairAndPresentInEveryRead() throws Exception {
        var data = request(); data.put("room", " \u00a0Salón \u00a0"); data.put("bookcase", " Billy  izquierda / nº 2 "); data.put("shelf", " Superior (A) ");
        JsonNode created = create(data); long id = created.path("id").asLong();
        assertThat(created.path("room").asText()).isEqualTo("Salón");
        assertThat(created.path("bookcase").asText()).isEqualTo("Billy  izquierda / nº 2");
        assertThat(created.path("shelf").asText()).isEqualTo("Superior (A)");
        assertThat(repository.findById(id).orElseThrow().getShelf()).isEqualTo("Superior (A)");
        mvc.perform(get("/api/books/{id}", id)).andExpect(jsonPath("$.room").value("Salón"));
        for (String path : List.of("/api/books", "/api/books/search")) {
            var query = get(path).param("room", "salón"); if (path.endsWith("search")) query.param("title", "Location book");
            mvc.perform(query).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].bookcase").value("Billy  izquierda / nº 2"))
                .andExpect(jsonPath("$.content[0].shelf").value("Superior (A)"));
        }
        for (var operation : List.of(
            patch("/api/books/{id}/reading-status", id).content("{\"readingStatus\":\"READING\"}"),
            put("/api/books/{id}/rating", id).content("{\"rating\":4}"),
            put("/api/books/{id}/reading-dates", id).content("{\"startedOn\":\"2026-10-13\",\"finishedOn\":null}"),
            post("/api/books/{id}/finish-reading", id).content("{\"date\":\"2026-10-13\"}")
        )) mvc.perform(operation.contentType(MediaType.APPLICATION_JSON)).andExpect(status().isOk())
            .andExpect(jsonPath("$.room").value("Salón")).andExpect(jsonPath("$.bookcase").value("Billy  izquierda / nº 2")).andExpect(jsonPath("$.shelf").value("Superior (A)"));
    }

    @ParameterizedTest @ValueSource(strings = {"room", "bookcase", "shelf"})
    void partialLocationIsAllowed(String field) throws Exception {
        var data = request(); data.put(field, "Abajo"); JsonNode created = create(data);
        for (String key : List.of("room", "bookcase", "shelf")) {
            assertThat(created.has(key)).isTrue();
            if (key.equals(field)) assertThat(created.path(key).asText()).isEqualTo("Abajo");
            else assertThat(created.path(key).isNull()).isTrue();
        }
    }

    @Test void omittedNullAndBlankCreateAreNull() throws Exception {
        for (int variant = 0; variant < 3; variant++) {
            var data = request();
            if (variant > 0) for (String field : List.of("room", "bookcase", "shelf")) data.put(field, variant == 1 ? null : " \u00a0 ");
            JsonNode created = create(data);
            for (String field : List.of("room", "bookcase", "shelf")) assertThat(created.path(field).isNull()).isTrue();
        }
    }

    @Test void putReplacesAndClearsAllThreeIncludingOmittedValues() throws Exception {
        var data = request(); data.put("room", "Salón"); data.put("bookcase", "Billy"); data.put("shelf", "3"); long id = create(data).path("id").asLong();
        data.put("room", " Dormitorio "); data.put("bookcase", null); data.put("shelf", " Abajo ");
        mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.room").value("Dormitorio"))
            .andExpect(jsonPath("$.bookcase").isEmpty()).andExpect(jsonPath("$.shelf").value("Abajo"));
        for (int variant = 0; variant < 3; variant++) {
            // Restore before each distinct clearing path.
            mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data))).andExpect(status().isOk());
            var clear = request(); if (variant > 0) for (String field : List.of("room", "bookcase", "shelf")) clear.put(field, variant == 1 ? null : "   ");
            mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(clear)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.room").isEmpty()).andExpect(jsonPath("$.bookcase").isEmpty()).andExpect(jsonPath("$.shelf").isEmpty());
        }
    }

    static Stream<Arguments> invalid() {
        return Stream.of("room", "bookcase", "shelf").flatMap(field -> Stream.of(
            "x".repeat(field.equals("shelf") ? 51 : 101), "\0", "\t", "\r", "\n", "a\u007fb", "a\u0085b", "a\u2028b", "a\u2029b",
            " "+ "x".repeat(field.equals("shelf") ? 50 : 100)
        ).map(value -> Arguments.of(field, value)));
    }
    @ParameterizedTest @MethodSource("invalid")
    void invalidRawLabelsAreRejectedBeforeTrimming(String field, String value) throws Exception {
        var data = request(); data.put(field, value);
        mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        long id = create(request()).path("id").asLong();
        mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        for (String path : List.of("/api/books", "/api/books/search")) {
            mvc.perform(get(path).param("title", "Location").param(field, value)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        }
    }

    @ParameterizedTest @ValueSource(strings = {"room", "bookcase", "shelf"})
    void exactMaximumAcceptedAndFiltersRejectBlankAndRepeated(String field) throws Exception {
        String value = "á".repeat(field.equals("shelf") ? 50 : 100); var data = request(); data.put(field, value);
        assertThat(create(data).path(field).asText()).isEqualTo(value);
        for (String path : List.of("/api/books", "/api/books/search")) {
            mvc.perform(get(path).param("title", "Location").param(field, value)).andExpect(status().isOk());
            for (String blank : List.of("", "   ", "\u00a0")) mvc.perform(get(path).param("title", "Location").param(field, blank))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
            mvc.perform(get(path).param("title", "Location").param(field, "A", "B"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        }
    }

    private Book seed(String title, String room, String bookcase, String shelf) {
        Book book = new Book(); book.setTitle(title); book.setAuthor("Location Author"); book.setRoom(room); book.setBookcase(bookcase); book.setShelf(shelf);
        book.setReadingStatus(ReadingStatus.READ); book.setRating(5); book.setPublicationYear(2020); book.setPublisher("Test Press"); book.setLanguage("es"); book.setGenres(List.of("Terror"));
        return repository.saveAndFlush(book);
    }

    @Test void postgresExactInsensitiveAccentSensitiveAndLiteralFilters() throws Exception {
        repository.deleteAll();
        seed("A", "Salón", "Billy izquierda", "Superior"); seed("B", "Salon", "Billy derecha", "3"); seed("C", null, null, null);
        seed("D", "%", "_", "%_");
        for (String path : List.of("/api/books", "/api/books/search")) {
            for (String[] pair : List.of(new String[]{"room", "salón"}, new String[]{"room", "SALÓN"}, new String[]{"room", "Salon"},
                new String[]{"bookcase", "billy IZQUIERDA"}, new String[]{"shelf", "superior"}, new String[]{"room", "%"}, new String[]{"bookcase", "_"}, new String[]{"shelf", "%_"})) {
                mvc.perform(get(path).param("author", "Location Author").param(pair[0], pair[1]))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
            }
            mvc.perform(get(path).param("author", "Location Author").param("room", "Sal"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
            mvc.perform(get(path).param("author", "Location Author").param("room", " salón ").param("bookcase", "Billy izquierda").param("shelf", "SUPERIOR")
                .param("readingStatus", "READ").param("ratingMin", "4").param("yearFrom", "2020").param("yearTo", "2020").param("genre", "terror").param("language", "ES").param("publisher", "press"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].title").value("A"));
            mvc.perform(get(path).param("author", "Location Author").param("room", "salón").param("bookcase", "Billy derecha"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        }
    }

    @Test void pagingCountSortAndIsbnSearchKeepExistingRules() throws Exception {
        repository.deleteAll(); Book a = seed("A", "Salón", "Billy", "3"); Book b = seed("B", "salón", "Billy", "3");
        b.setIsbn("9780306406157"); repository.saveAndFlush(b); seed("Z", "Other", null, null);
        for (String path : List.of("/api/books", "/api/books/search")) {
            mvc.perform(get(path).param("author", "Location Author").param("room", "salón").param("size", "1").param("sortBy", "title").param("direction", "DESC"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content[0].id").value(b.getId()));
            mvc.perform(get(path).param("author", "Location Author").param("room", "salón").param("size", "1").param("page", "1").param("direction", "DESC"))
                .andExpect(jsonPath("$.content[0].id").value(a.getId()));
            mvc.perform(get(path).param("author", "Location Author").param("room", "salón").param("size", "1").param("page", "9"))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content").isEmpty());
        }
        mvc.perform(get("/api/books/search").param("isbn", "9780306406157").param("room", "SALÓN"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(b.getId()));
        mvc.perform(get("/api/books/search").param("room", "salón")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/search").param("isbn", "9780306406157").param("title", "B").param("room", "salón")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books").param("sortBy", "room")).andExpect(status().isBadRequest());
    }
}

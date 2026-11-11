package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookGenreFilterIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private BookRepository repository;
    @Autowired private ObjectMapper objectMapper;

    private Long terrorFantasyEs;
    private Long terrorFr;
    private Long fantasyEs;
    private Long unassignedEs;
    private Long fantasyWithoutAccent;

    @BeforeEach
    void seed() {
        repository.deleteAll();
        terrorFantasyEs = save("A combined", List.of("Terror", "Fantasía"), "es", 2020);
        terrorFr = save("B terror only", List.of("Terror"), "fr", 2021);
        fantasyEs = save("C fantasy only", List.of("Fantasía"), "es", 2022);
        unassignedEs = save("D no genre", List.of(), "es", 2020);
        fantasyWithoutAccent = save("E unaccented", List.of("Fantasia"), "es", 2020);
    }

    @Test
    void repeatedGenresCombineWithOrWithoutDuplicatingRows() throws Exception {
        mvc.perform(get("/api/books")
                .param("genre", "tERROR", " Fantasía ", "Terror")
                .param("page", "0").param("size", "2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(3))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.content.length()").value(2));
        mvc.perform(get("/api/books")
                .param("genre", "Terror", "Fantasía")
                .param("page", "1").param("size", "2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(3))
            .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    void genreGroupCombinesWithAndAgainstTheOtherFiltersInListAndSearch() throws Exception {
        mvc.perform(get("/api/books")
                .param("genre", "Terror", "Fantasía")
                .param("language", "es")
                .param("yearFrom", "2021"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].id").value(fantasyEs));
        mvc.perform(get("/api/books/search")
                .param("title", "only")
                .param("genre", "Terror", "Fantasía")
                .param("language", "es"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].id").value(fantasyEs));
    }

    @Test
    void genreUnassignedSelectsBooksWithoutGenresAloneOrCombinedWithOr() throws Exception {
        mvc.perform(get("/api/books").param("genreUnassigned", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].id").value(unassignedEs));
        mvc.perform(get("/api/books")
                .param("genre", "Terror")
                .param("genreUnassigned", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(3));
        mvc.perform(get("/api/books").param("genreUnassigned", "false"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(5));
    }

    @Test
    void noGenreFilterReturnsEveryBookThatMatchesTheOtherFilters() throws Exception {
        mvc.perform(get("/api/books").param("language", "es"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(4))
            .andExpect(jsonPath("$.content[*].id").value(org.hamcrest.Matchers.containsInAnyOrder(
                terrorFantasyEs.intValue(), fantasyEs.intValue(), unassignedEs.intValue(),
                fantasyWithoutAccent.intValue())));
    }

    @Test
    void accentsRemainDistinctWhileCaseAndOuterSpacesDoNot() throws Exception {
        mvc.perform(get("/api/books").param("genre", "fantasía"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get("/api/books").param("genre", "Fantasia"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].id").value(fantasyWithoutAccent));
    }

    @Test
    void distinctGenresReflectCreateEditAndDeleteWithAccentSensitiveDeduplication() throws Exception {
        mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Created\",\"author\":\"A\",\"genres\":[\"Terror\",\"Ciencia ficción\"]}"))
            .andExpect(status().isCreated());
        JsonNode created = objectMapper.readTree(mvc.perform(get("/api/books/genres"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(texts(created)).contains("Fantasía", "Fantasia", "Terror", "Ciencia ficción");

        mvc.perform(put("/api/books/" + terrorFr).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"B terror only\",\"author\":\"Author\",\"genres\":[\"Aventura\"]}"))
            .andExpect(status().isOk());
        JsonNode updated = objectMapper.readTree(mvc.perform(get("/api/books/genres"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(texts(updated)).contains("Aventura", "Terror", "Fantasía", "Fantasia");
        assertThat(texts(updated)).containsOnlyOnce("Terror");

        mvc.perform(delete("/api/books/" + fantasyWithoutAccent)).andExpect(status().isNoContent());
        JsonNode deleted = objectMapper.readTree(mvc.perform(get("/api/books/genres"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(texts(deleted)).doesNotContain("Fantasia").contains("Fantasía");
    }

    @Test
    void distinctGenresAreTrimmedDeterministicallyAndIgnoreEmptyLegacyEntries() throws Exception {
        repository.deleteAll();
        save("B", List.of("Zeta", "Alfa"), "es", 2020);
        save("A", List.of("Alfa", "Beta", "  "), "es", 2020);
        String first = mvc.perform(get("/api/books/genres"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isArray())
            .andExpect(jsonPath("$[0]").value("Alfa"))
            .andExpect(jsonPath("$[1]").value("Beta"))
            .andExpect(jsonPath("$[2]").value("Zeta"))
            .andReturn().getResponse().getContentAsString();
        assertThat(texts(objectMapper.readTree(first))).doesNotContain("");
        String second = mvc.perform(get("/api/books/genres"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
    }

    private List<String> texts(JsonNode array) {
        return objectMapper.convertValue(array,
            objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
    }

    private Long save(String title, List<String> genres, String language, int year) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Author");
        book.setGenres(genres);
        book.setLanguage(language);
        book.setPublicationYear(year);
        return repository.saveAndFlush(book).getId();
    }
}

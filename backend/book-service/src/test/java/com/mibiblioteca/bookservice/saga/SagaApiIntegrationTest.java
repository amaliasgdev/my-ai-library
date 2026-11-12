package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SagaApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void emptySagas() {
        jdbc.update("DELETE FROM public.saga");
    }

    @Test
    void createsEmptySagaWithStringRevisionAndZeroProgress() throws Exception {
        var result = mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("Nacidos de la bruma", "Brandon Sanderson", "Fantasía", "https://example.com/mistborn.jpg")))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"))
            .andExpect(jsonPath("$.id").isNumber())
            .andExpect(jsonPath("$.name").value("Nacidos de la bruma"))
            .andExpect(jsonPath("$.author").value("Brandon Sanderson"))
            .andExpect(jsonPath("$.description").value("Fantasía"))
            .andExpect(jsonPath("$.imageUrl").value("https://example.com/mistborn.jpg"))
            .andExpect(jsonPath("$.revision").value("0"))
            .andExpect(jsonPath("$.createdAt").isNotEmpty())
            .andExpect(jsonPath("$.updatedAt").isNotEmpty())
            .andExpect(jsonPath("$.progress.total").value(0))
            .andExpect(jsonPath("$.progress.linked").value(0))
            .andExpect(jsonPath("$.progress.pending").value(0))
            .andExpect(jsonPath("$.progress.read").value(0))
            .andExpect(jsonPath("$.progress.reading").value(0))
            .andExpect(jsonPath("$.progress.toRead").value(0))
            .andExpect(jsonPath("$.progress.abandoned").value(0))
            .andReturn();

        long id = json.readTree(result.getResponse().getContentAsString()).path("id").asLong();
        assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/sagas/" + id);
    }

    @Test
    void trimsNameAndAuthorAndStoresBlankAuthorAsNull() throws Exception {
        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("  Saga trimada  ", "  Autora  ", null, null)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Saga trimada"))
            .andExpect(jsonPath("$.author").value("Autora"))
            .andExpect(jsonPath("$.description").isEmpty())
            .andExpect(jsonPath("$.imageUrl").isEmpty());

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("Saga sin autor", "   ", null, null)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.author").isEmpty());
    }

    @Test
    void returnsSagaById() throws Exception {
        long id = create("Saga", "Autor");

        mvc.perform(get("/api/sagas/{id}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.name").value("Saga"))
            .andExpect(jsonPath("$.revision").value("0"))
            .andExpect(jsonPath("$.progress.total").value(0));
    }

    @Test
    void missingSagaReturnsProblemDetailOnEveryReadAndWrite() throws Exception {
        long absent = 9_000_000L;

        mvc.perform(get("/api/sagas/{id}", absent))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_NOT_FOUND"))
            .andExpect(jsonPath("$.detail").value("The saga does not exist"));

        mvc.perform(put("/api/sagas/{id}", absent).param("expectedRevision", "0")
                .contentType(MediaType.APPLICATION_JSON).content(body("Saga", null, null, null)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_NOT_FOUND"));

        mvc.perform(delete("/api/sagas/{id}", absent).param("expectedRevision", "0"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_NOT_FOUND"));
    }

    @Test
    void listsSagasWithPagination() throws Exception {
        create("Alfa", null);
        create("Beta", null);
        create("Gamma", null);
        create("Delta", null);

        mvc.perform(get("/api/sagas").param("page", "0").param("size", "2").param("sortBy", "name"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2))
            .andExpect(jsonPath("$.content[0].name").value("Alfa"))
            .andExpect(jsonPath("$.content[1].name").value("Beta"))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(2))
            .andExpect(jsonPath("$.totalElements").value(4))
            .andExpect(jsonPath("$.totalPages").value(2));

        mvc.perform(get("/api/sagas").param("page", "1").param("size", "3").param("sortBy", "name"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].name").value("Gamma"))
            .andExpect(jsonPath("$.page").value(1))
            .andExpect(jsonPath("$.totalElements").value(4));
    }

    @Test
    void searchesByNameIgnoringCaseAndOuterSpaces() throws Exception {
        create("Nacidos de la bruma", "Brandon Sanderson");
        create("El nombre del viento", "Patrick Rothfuss");

        mvc.perform(get("/api/sagas").param("name", "BRUMA"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].name").value("Nacidos de la bruma"));

        mvc.perform(get("/api/sagas").param("name", "  bruma  "))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(1));

        mvc.perform(get("/api/sagas").param("name", "   "))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void sortsSagasByRequestedDirectionWithIdTieBreaker() throws Exception {
        create("Alfa", null);
        create("Beta", null);
        create("Gamma", null);

        mvc.perform(get("/api/sagas").param("sortBy", "name").param("direction", "DESC"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].name").value("Gamma"))
            .andExpect(jsonPath("$.content[1].name").value("Beta"))
            .andExpect(jsonPath("$.content[2].name").value("Alfa"));
    }

    @Test
    void updatesSagaAndIncrementsRevisionOnce() throws Exception {
        long id = create("Nombre original", "Autor original");
        String createdAt = mvc.perform(get("/api/sagas/{id}", id))
            .andReturn().getResponse().getContentAsString();
        String originalCreatedAt = json.readTree(createdAt).path("createdAt").asText();

        mvc.perform(put("/api/sagas/{id}", id).param("expectedRevision", "0")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body("Nombre nuevo", "Autor nuevo", "Nueva descripción", "https://example.com/new.jpg")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Nombre nuevo"))
            .andExpect(jsonPath("$.author").value("Autor nuevo"))
            .andExpect(jsonPath("$.description").value("Nueva descripción"))
            .andExpect(jsonPath("$.imageUrl").value("https://example.com/new.jpg"))
            .andExpect(jsonPath("$.revision").value("1"))
            .andExpect(jsonPath("$.createdAt").value(originalCreatedAt));

        mvc.perform(get("/api/sagas/{id}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Nombre nuevo"))
            .andExpect(jsonPath("$.revision").value("1"));
    }

    @Test
    void staleRevisionOnUpdateReturnsConflictAndKeepsOriginalValues() throws Exception {
        long id = create("Original", "Autor");

        mvc.perform(put("/api/sagas/{id}", id).param("expectedRevision", "1")
                .contentType(MediaType.APPLICATION_JSON).content(body("Cambiada", null, null, null)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"))
            .andExpect(jsonPath("$.errors.expectedRevision").exists());

        mvc.perform(get("/api/sagas/{id}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Original"))
            .andExpect(jsonPath("$.revision").value("0"));
    }

    @Test
    void deletesSagaWithExpectedRevision() throws Exception {
        long id = create("Para borrar", null);

        mvc.perform(delete("/api/sagas/{id}", id).param("expectedRevision", "0"))
            .andExpect(status().isNoContent());

        mvc.perform(get("/api/sagas/{id}", id)).andExpect(status().isNotFound());
    }

    @Test
    void staleRevisionOnDeleteReturnsConflictAndKeepsSaga() throws Exception {
        long id = create("Conservada", null);

        mvc.perform(delete("/api/sagas/{id}", id).param("expectedRevision", "1"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));

        mvc.perform(get("/api/sagas/{id}", id)).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1", "01", "+1", "1.0", " 0", "1e2", "9223372036854775808"})
    void rejectsInvalidRevisionFormatsOnBothWrites(String revision) throws Exception {
        mvc.perform(put("/api/sagas/1").param("expectedRevision", revision)
                .contentType(MediaType.APPLICATION_JSON).content(body("Saga", null, null, null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));

        mvc.perform(delete("/api/sagas/1").param("expectedRevision", revision))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));
    }

    @Test
    void requiresExactlyOneExpectedRevision() throws Exception {
        mvc.perform(put("/api/sagas/1").contentType(MediaType.APPLICATION_JSON)
                .content(body("Saga", null, null, null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));

        mvc.perform(delete("/api/sagas/1").param("expectedRevision", "0", "1"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));
    }

    @Test
    void validatesRequestFields() throws Exception {
        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Validation error"))
            .andExpect(jsonPath("$.errors.name").exists());

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("   ", null, null, null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.name").exists());

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("n".repeat(256), null, null, null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.name").exists());

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("Saga", "a".repeat(256), null, null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.author").exists());

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("Saga", null, "d".repeat(5001), null)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.description").exists());

        for (String imageUrl : List.of("ftp://example.com/a.jpg", "not a url", "https://exa mple.com/a.jpg")) {
            mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                    .content(body("Saga", null, null, imageUrl)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.imageUrl").exists());
        }
    }

    @Test
    void rejectsDuplicateNameAndAuthorIgnoringCaseAndOuterSpaces() throws Exception {
        create("Saga Uno", "Autora");

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("  saga uno  ", "  AUTORA  ", null, null)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_NAME_CONFLICT"))
            .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void rejectsDuplicateWhenBothAuthorsAreAbsentOrBlank() throws Exception {
        create("Saga sin autor", null);

        mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body("SAGA SIN AUTOR", "   ", null, null)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_NAME_CONFLICT"));
    }

    @Test
    void allowsSameNameForDifferentAuthors() throws Exception {
        create("Saga compartida", "Autora uno");
        create("Saga compartida", "Autora dos");

        mvc.perform(get("/api/sagas").param("name", "compartida"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void rejectsInvalidPaginationSearchAndSortParameters() throws Exception {
        mvc.perform(get("/api/sagas").param("page", "-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/sagas").param("size", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/sagas").param("size", "101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/sagas").param("sortBy", "isbn"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Invalid sort parameter"));
        mvc.perform(get("/api/sagas").param("direction", "SIDEWAYS")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/sagas").param("name", "n".repeat(256))).andExpect(status().isBadRequest());
    }

    @Test
    void sagaWritesDoNotTouchBooksOrTheReadingList() throws Exception {
        long booksBefore = count("SELECT count(*) FROM public.book");
        long entriesBefore = count("SELECT count(*) FROM public.reading_list_entry");
        long revisionBefore = count("SELECT revision FROM public.reading_list WHERE id = 1");

        long id = create("Saga aislada", null);
        mvc.perform(put("/api/sagas/{id}", id).param("expectedRevision", "0")
                .contentType(MediaType.APPLICATION_JSON).content(body("Saga editada", null, null, null)))
            .andExpect(status().isOk());
        mvc.perform(delete("/api/sagas/{id}", id).param("expectedRevision", "1"))
            .andExpect(status().isNoContent());

        assertThat(count("SELECT count(*) FROM public.book")).isEqualTo(booksBefore);
        assertThat(count("SELECT count(*) FROM public.reading_list_entry")).isEqualTo(entriesBefore);
        assertThat(count("SELECT revision FROM public.reading_list WHERE id = 1")).isEqualTo(revisionBefore);
    }

    private long create(String name, String author) throws Exception {
        var result = mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content(body(name, author, null, null)))
            .andExpect(status().isCreated()).andReturn();
        long id = json.readTree(result.getResponse().getContentAsString()).path("id").asLong();
        assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/sagas/" + id);
        return id;
    }

    private long count(String sql) {
        return jdbc.queryForObject(sql, Long.class);
    }

    private String body(String name, String author, String description, String imageUrl) throws Exception {
        var node = json.createObjectNode();
        if (name == null) {
            node.putNull("name");
        } else {
            node.put("name", name);
        }
        if (author == null) {
            node.putNull("author");
        } else {
            node.put("author", author);
        }
        if (description == null) {
            node.putNull("description");
        } else {
            node.put("description", description);
        }
        if (imageUrl == null) {
            node.putNull("imageUrl");
        } else {
            node.put("imageUrl", imageUrl);
        }
        return json.writeValueAsString(node);
    }
}

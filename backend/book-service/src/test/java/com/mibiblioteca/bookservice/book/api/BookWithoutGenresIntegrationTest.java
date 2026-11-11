package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** A genre is optional end to end: DTO, entity and the isolated PostgreSQL column (NOT NULL DEFAULT '{}'). */
@SpringBootTest
@AutoConfigureMockMvc
class BookWithoutGenresIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    private final List<Long> created = new ArrayList<>();

    @AfterEach
    void removeOnlyBooksCreatedByThisTest() throws Exception {
        for (long id : created) mockMvc.perform(delete("/api/books/" + id)).andExpect(status().isNoContent());
        created.clear();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{\"title\":\"No genre omitted\",\"author\":\"A\"}",
        "{\"title\":\"No genre null\",\"author\":\"A\",\"genres\":null}",
        "{\"title\":\"No genre empty\",\"author\":\"A\",\"genres\":[],\"isbn\":null}"
    })
    void booksWithoutGenresOrIsbnArePersistedWithAnEmptyArray(String body) throws Exception {
        String response = mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.genres").isEmpty())
            .andExpect(jsonPath("$.isbn").doesNotExist()).andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).path("id").asLong();
        created.add(id);
        mockMvc.perform(get("/api/books/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.genres").isEmpty());
        assertThat(jdbc.queryForObject("select cardinality(genres) from book where id = ?", Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from book where id = ? and genres = '{}'", Integer.class, id)).isEqualTo(1);
    }

    @org.junit.jupiter.api.Test
    void blankGenreIsStillRejectedAndNoPlaceholderIsStored() throws Exception {
        mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Blank genre\",\"author\":\"A\",\"genres\":[\" \"]}"))
            .andExpect(status().isBadRequest());
    }
}

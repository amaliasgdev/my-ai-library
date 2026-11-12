package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookSagaMembershipApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookRepository books;
    @Autowired private SagaService sagaService;
    @Autowired private SagaVolumeService volumeService;

    @BeforeEach
    void emptySagas() {
        jdbc.update("DELETE FROM public.saga_volume");
        jdbc.update("DELETE FROM public.saga");
    }

    @Test
    void bookWithoutSagasReturnsAnEmptyArray() throws Exception {
        long book = book("Sin sagas");

        var result = mvc.perform(get("/api/books/{id}/sagas", book))
            .andExpect(status().isOk()).andReturn();

        assertThat(json.readTree(result.getResponse().getContentAsString()).isArray()).isTrue();
        assertThat(json.readTree(result.getResponse().getContentAsString())).isEmpty();
    }

    @Test
    void missingBookReturnsNotFound() throws Exception {
        mvc.perform(get("/api/books/{id}/sagas", 9_000_000L))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.title").value("Book not found"));
    }

    @Test
    void returnsEverySagaOrderedByNameAndSagaIdWithVolumeDetails() throws Exception {
        long book = book("Libro compartido");
        long zeta = saga("Zeta", null);
        long alfa = saga("alfa", null);
        long beta = saga("Beta", null);
        long zetaVolume = addLinked(zeta, book, "3");
        long alfaVolume = addLinked(alfa, book, "0.5");
        long betaVolume = addLinked(beta, book, null);

        var result = mvc.perform(get("/api/books/{id}/sagas", book))
            .andExpect(status().isOk()).andReturn();
        JsonNode memberships = json.readTree(result.getResponse().getContentAsString());

        assertThat(memberships).hasSize(3);
        assertThat(memberships.get(0).path("sagaId").asLong()).isEqualTo(alfa);
        assertThat(memberships.get(0).path("sagaName").asText()).isEqualTo("alfa");
        assertThat(memberships.get(0).path("volumeId").asLong()).isEqualTo(alfaVolume);
        assertThat(memberships.get(0).path("position").asInt()).isEqualTo(1);
        assertThat(memberships.get(0).path("volumeLabel").asText()).isEqualTo("0.5");

        assertThat(memberships.get(1).path("sagaId").asLong()).isEqualTo(beta);
        assertThat(memberships.get(1).path("volumeId").asLong()).isEqualTo(betaVolume);
        assertThat(memberships.get(1).path("volumeLabel").isNull()).isTrue();

        assertThat(memberships.get(2).path("sagaId").asLong()).isEqualTo(zeta);
        assertThat(memberships.get(2).path("volumeId").asLong()).isEqualTo(zetaVolume);
        assertThat(memberships.get(2).path("volumeLabel").asText()).isEqualTo("3");
    }

    @Test
    void sameSagaNameIsOrderedBySagaId() throws Exception {
        long book = book("Libro con nombres iguales");
        long first = saga("Saga repetida", "Autora A");
        long second = saga("Saga repetida", "Autora B");
        addLinked(second, book, "2");
        addLinked(first, book, "1");

        var result = mvc.perform(get("/api/books/{id}/sagas", book))
            .andExpect(status().isOk()).andReturn();
        JsonNode memberships = json.readTree(result.getResponse().getContentAsString());

        assertThat(memberships).hasSize(2);
        assertThat(memberships.get(0).path("sagaId").asLong()).isEqualTo(first);
        assertThat(memberships.get(1).path("sagaId").asLong()).isEqualTo(second);
    }

    @Test
    void membershipEndpointDoesNotChangeBookResponse() throws Exception {
        long book = book("Contrato intacto");
        long saga = saga("Saga", null);
        addLinked(saga, book, "1");

        var result = mvc.perform(get("/api/books/{id}", book))
            .andExpect(status().isOk()).andReturn();
        JsonNode bookResponse = json.readTree(result.getResponse().getContentAsString());

        assertThat(bookResponse.path("id").asLong()).isEqualTo(book);
        assertThat(bookResponse.path("title").asText()).isEqualTo("Contrato intacto");
        assertThat(bookResponse.has("sagas")).isFalse();
        assertThat(bookResponse.path("readingStatus").asText()).isEqualTo("TO_READ");
    }

    private long saga(String name, String author) {
        return sagaService.create(new SagaRequest(name, author, null, null)).id();
    }

    private long book(String title) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Autora");
        book.setReadingStatus(ReadingStatus.TO_READ);
        return books.saveAndFlush(book).getId();
    }

    private long addLinked(long saga, long book, String label) {
        String revision = volumeService.findAll(saga).revision();
        return volumeService.add(saga, new AddSagaVolumeRequest(book, null, label, revision))
            .volume().id();
    }
}

package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import java.util.Collection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SagaProgressApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookRepository books;
    @Autowired private SagaService sagaService;
    @Autowired private SagaVolumeService volumeService;
    @MockitoSpyBean private SagaVolumeRepository volumeRepository;

    @BeforeEach
    void emptySagasAndReadingList() {
        jdbc.update("DELETE FROM public.saga_volume");
        jdbc.update("DELETE FROM public.saga");
        jdbc.update("DELETE FROM public.reading_list_entry");
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @Test
    void emptySagaReturnsZeroCountersOnListDetailAndVolumes() throws Exception {
        long saga = saga("Vacía");

        for (JsonNode progress : new JsonNode[] {detailProgress(saga), listProgress("Vacía"), volumesProgress(saga)}) {
            assertCounters(progress, 0, 0, 0, 0, 0, 0, 0);
            assertInvariants(progress);
        }
    }

    @Test
    void countsEveryReadingStatusAndPendingVolumes() throws Exception {
        long saga = saga("Estados");
        addLinked(saga, book("Leído", ReadingStatus.READ), "1");
        addLinked(saga, book("Leyendo", ReadingStatus.READING), "2");
        addLinked(saga, book("Por leer", ReadingStatus.TO_READ), "3");
        addLinked(saga, book("Abandonado", ReadingStatus.ABANDONED), "4");
        addPending(saga, "Pendiente", "5");

        for (JsonNode progress : new JsonNode[] {detailProgress(saga), listProgress("Estados"), volumesProgress(saga)}) {
            assertCounters(progress, 5, 4, 1, 1, 1, 1, 1);
            assertInvariants(progress);
        }
    }

    @Test
    void linkingAndUnlinkingUpdateProgressWithoutPersistingCounters() throws Exception {
        long saga = saga("Vínculos");
        long book = book("Libro", ReadingStatus.TO_READ);
        addPending(saga, "Pendiente", "0.5");

        assertCounters(detailProgress(saga), 1, 0, 1, 0, 0, 0, 0);
        long volumeId = volumeService.findAll(saga).volumes().getFirst().id();
        volumeService.link(saga, volumeId, new SagaDtos.LinkSagaVolumeRequest(book, "1"));

        assertCounters(detailProgress(saga), 1, 1, 0, 0, 0, 1, 0);

        volumeService.unlink(saga, volumeId, new SagaDtos.UnlinkSagaVolumeRequest(null, "2"));

        assertCounters(detailProgress(saga), 1, 0, 1, 0, 0, 0, 0);
    }

    @Test
    void bookReadingStatusChangesAreReflectedImmediately() throws Exception {
        long saga = saga("Cambios");
        long book = book("Libro", ReadingStatus.TO_READ);
        addLinked(saga, book, "1");

        assertCounters(detailProgress(saga), 1, 1, 0, 0, 0, 1, 0);

        changeStatus(book, "READING");
        assertCounters(detailProgress(saga), 1, 1, 0, 0, 1, 0, 0);

        changeStatus(book, "READ");
        assertCounters(detailProgress(saga), 1, 1, 0, 1, 0, 0, 0);

        changeStatus(book, "ABANDONED");
        assertCounters(detailProgress(saga), 1, 1, 0, 0, 0, 0, 1);
        assertCounters(listProgress("Cambios"), 1, 1, 0, 0, 0, 0, 1);
    }

    @Test
    void deletingABookMovesItsVolumeToPendingAndUpdatesProgress() throws Exception {
        long saga = saga("Borrado");
        long book = book("Libro borrado", ReadingStatus.READ);
        addLinked(saga, book, "1");

        assertCounters(detailProgress(saga), 1, 1, 0, 1, 0, 0, 0);

        mvc.perform(delete("/api/books/{id}", book)).andExpect(status().isNoContent());

        JsonNode progress = detailProgress(saga);
        assertCounters(progress, 1, 0, 1, 0, 0, 0, 0);
        assertInvariants(progress);
        assertThat(volumesResponse(saga).path("volumes").get(0).path("pendingTitle").asText())
            .isEqualTo("Libro borrado");
    }

    @Test
    void theSameBookCountsInEverySagaItBelongsTo() throws Exception {
        long first = saga("Primera");
        long second = saga("Segunda");
        long book = book("Compartido", ReadingStatus.READ);
        addLinked(first, book, "1");
        addLinked(second, book, "1");

        assertCounters(detailProgress(first), 1, 1, 0, 1, 0, 0, 0);
        assertCounters(detailProgress(second), 1, 1, 0, 1, 0, 0, 0);
        assertCounters(listProgress("Primera"), 1, 1, 0, 1, 0, 0, 0);
        assertCounters(listProgress("Segunda"), 1, 1, 0, 1, 0, 0, 0);
    }

    @Test
    void paginatedListUsesOneBatchAggregateAndNoPerSagaVolumeLoads() throws Exception {
        long alfa = saga("Alfa");
        long beta = saga("Beta");
        long gamma = saga("Gamma");
        addLinked(alfa, book("Alfa 1", ReadingStatus.READ), "1");
        addLinked(alfa, book("Alfa 2", ReadingStatus.TO_READ), "2");
        addLinked(beta, book("Beta 1", ReadingStatus.READING), "1");
        addLinked(gamma, book("Gamma 1", ReadingStatus.ABANDONED), "1");
        clearInvocations(volumeRepository);

        var result = mvc.perform(get("/api/sagas").param("page", "0").param("size", "2")
                .param("sortBy", "name"))
            .andExpect(status().isOk()).andReturn();
        JsonNode page = json.readTree(result.getResponse().getContentAsString());

        assertThat(page.path("content")).hasSize(2);
        assertCounters(page.path("content").get(0).path("progress"), 2, 2, 0, 1, 0, 1, 0);
        assertCounters(page.path("content").get(1).path("progress"), 1, 1, 0, 0, 1, 0, 0);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(volumeRepository, times(1)).findProgressBySagaIds(ids.capture());
        assertThat(ids.getValue()).containsExactlyInAnyOrder(alfa, beta);
        verify(volumeRepository, never()).findBySagaIdOrderByPositionAsc(any());
        verify(volumeRepository, never()).findDetailedBySagaIdOrderByPosition(any());
    }

    private long saga(String name) {
        return sagaService.create(new SagaRequest(name, null, null, null)).id();
    }

    private long book(String title, ReadingStatus status) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Autora");
        book.setReadingStatus(status);
        return books.saveAndFlush(book).getId();
    }

    private void addLinked(long saga, long book, String label) {
        String revision = volumeService.findAll(saga).revision();
        volumeService.add(saga, new AddSagaVolumeRequest(book, null, label, revision));
    }

    private void addPending(long saga, String title, String label) {
        String revision = volumeService.findAll(saga).revision();
        volumeService.add(saga, new AddSagaVolumeRequest(null, title, label, revision));
    }

    private void changeStatus(long book, String status) throws Exception {
        mvc.perform(patch("/api/books/{id}/reading-status", book)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"readingStatus\":\"" + status + "\"}"))
            .andExpect(status().isOk());
    }

    private JsonNode detailProgress(long saga) throws Exception {
        return json.readTree(mvc.perform(get("/api/sagas/{id}", saga))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("progress");
    }

    private JsonNode listProgress(String name) throws Exception {
        return json.readTree(mvc.perform(get("/api/sagas").param("name", name))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
            .path("content").get(0).path("progress");
    }

    private JsonNode volumesProgress(long saga) throws Exception {
        return volumesResponse(saga).path("progress");
    }

    private JsonNode volumesResponse(long saga) throws Exception {
        return json.readTree(mvc.perform(get("/api/sagas/{id}/volumes", saga))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private void assertCounters(JsonNode progress, int total, int linked, int pending,
                                int read, int reading, int toRead, int abandoned) {
        assertThat(progress.path("total").asInt()).isEqualTo(total);
        assertThat(progress.path("linked").asInt()).isEqualTo(linked);
        assertThat(progress.path("pending").asInt()).isEqualTo(pending);
        assertThat(progress.path("read").asInt()).isEqualTo(read);
        assertThat(progress.path("reading").asInt()).isEqualTo(reading);
        assertThat(progress.path("toRead").asInt()).isEqualTo(toRead);
        assertThat(progress.path("abandoned").asInt()).isEqualTo(abandoned);
        assertInvariants(progress);
    }

    private void assertInvariants(JsonNode progress) {
        assertThat(progress.path("total").asInt())
            .isEqualTo(progress.path("linked").asInt() + progress.path("pending").asInt());
        assertThat(progress.path("linked").asInt())
            .isEqualTo(progress.path("read").asInt() + progress.path("reading").asInt()
                + progress.path("toRead").asInt() + progress.path("abandoned").asInt());
    }
}

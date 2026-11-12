package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SagaVolumeApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookRepository books;

    @BeforeEach
    void emptySagasAndReadingList() {
        jdbc.update("DELETE FROM public.saga_volume");
        jdbc.update("DELETE FROM public.saga");
        jdbc.update("DELETE FROM public.reading_list_entry");
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @Test
    void createsPendingAndLinkedVolumesAtTheEndWithContiguousPositions() throws Exception {
        long saga = saga("Saga");
        long book = book("Vinculado", ReadingStatus.READ);

        var pending = addPending(saga, "Pendiente", "0.5", "0");
        assertThat(pending.path("revision").asText()).isEqualTo("1");
        assertThat(pending.path("volume").path("id").asLong()).isPositive();
        assertThat(pending.path("volume").path("position").asInt()).isEqualTo(1);
        assertThat(pending.path("volume").path("volumeLabel").asText()).isEqualTo("0.5");
        assertThat(pending.path("volume").path("pendingTitle").asText()).isEqualTo("Pendiente");
        assertThat(pending.path("volume").path("bookId").isNull()).isTrue();

        var linked = addLinked(saga, book, null, "1");
        assertThat(linked.path("revision").asText()).isEqualTo("2");
        assertThat(linked.path("volume").path("position").asInt()).isEqualTo(2);
        assertThat(linked.path("volume").path("bookId").asLong()).isEqualTo(book);
        assertThat(linked.path("volume").path("pendingTitle").isNull()).isTrue();
        assertThat(linked.path("volume").path("book").path("title").asText()).isEqualTo("Vinculado");
        assertThat(linked.path("volume").path("book").path("readingStatus").asText()).isEqualTo("READ");

        var listed = volumes(saga);
        assertThat(listed.path("revision").asText()).isEqualTo("2");
        assertThat(listed.path("volumes")).hasSize(2);
        assertThat(listed.path("volumes").get(0).path("position").asInt()).isEqualTo(1);
        assertThat(listed.path("volumes").get(1).path("position").asInt()).isEqualTo(2);
        assertThat(listed.path("progress").path("total").asInt()).isEqualTo(2);
        assertThat(listed.path("progress").path("linked").asInt()).isEqualTo(1);
        assertThat(listed.path("progress").path("pending").asInt()).isEqualTo(1);
        assertThat(listed.path("progress").path("read").asInt()).isEqualTo(1);
    }

    @Test
    void returnsLocationForTheCreatedVolume() throws Exception {
        long saga = saga("Saga");

        var result = mvc.perform(post("/api/sagas/{saga}/volumes", saga)
                .contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(null, "Pendiente", null, "0")))
            .andExpect(status().isCreated()).andReturn();

        long volumeId = json.readTree(result.getResponse().getContentAsString())
            .path("volume").path("id").asLong();
        assertThat(result.getResponse().getHeader("Location"))
            .isEqualTo("/api/sagas/" + saga + "/volumes/" + volumeId);
    }

    @Test
    void rejectsNonexistentBook() throws Exception {
        long saga = saga("Saga");

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(9_000_000L, null, null, "0")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_BOOK_NOT_FOUND"))
            .andExpect(jsonPath("$.errors.bookId").exists());

        assertThat(volumes(saga).path("revision").asText()).isEqualTo("0");
        assertThat(volumes(saga).path("volumes")).isEmpty();
    }

    @Test
    void rejectsDuplicateBookInTheSameSaga() throws Exception {
        long saga = saga("Saga");
        long book = book("Único", ReadingStatus.TO_READ);
        addLinked(saga, book, null, "0");

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(book, null, null, "1")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_ALREADY_CONTAINS_BOOK"));

        var listed = volumes(saga);
        assertThat(listed.path("revision").asText()).isEqualTo("1");
        assertThat(listed.path("volumes")).hasSize(1);
    }

    @Test
    void allowsTheSameBookInDifferentSagas() throws Exception {
        long first = saga("Primera");
        long second = saga("Segunda");
        long book = book("Compartido", ReadingStatus.READ);

        addLinked(first, book, "1", "0");
        addLinked(second, book, "1", "0");

        assertThat(volumes(first).path("volumes")).hasSize(1);
        assertThat(volumes(second).path("volumes")).hasSize(1);
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE book_id = ?", Long.class, book)).isEqualTo(2);
    }

    @Test
    void linksAPendingVolumeWithoutChangingRowIdentityPositionOrLabel() throws Exception {
        long saga = saga("Saga");
        long book = book("Libro", ReadingStatus.READING);
        var pending = addPending(saga, "Pendiente", "0.5", "0");
        long volumeId = pending.path("volume").path("id").asLong();

        var linked = mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/link", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(linkBody(book, "1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.volume.id").value(volumeId))
            .andExpect(jsonPath("$.volume.position").value(1))
            .andExpect(jsonPath("$.volume.volumeLabel").value("0.5"))
            .andExpect(jsonPath("$.volume.bookId").value(book))
            .andExpect(jsonPath("$.volume.pendingTitle").isEmpty())
            .andReturn().getResponse().getContentAsString();

        assertThat(json.readTree(linked).path("volume").path("id").asLong()).isEqualTo(volumeId);
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE saga_id = ?", Long.class, saga)).isEqualTo(1);

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/link", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(linkBody(book, "2")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.volume.id").value(volumeId));
    }

    @Test
    void rejectsLinkingAVolumeAlreadyLinkedToAnotherBook() throws Exception {
        long saga = saga("Saga");
        long first = book("Primero", ReadingStatus.TO_READ);
        long second = book("Segundo", ReadingStatus.TO_READ);
        var linked = addLinked(saga, first, null, "0");
        long volumeId = linked.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/link", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(linkBody(second, "1")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_ALREADY_LINKED"));
    }

    @Test
    void rejectsLinkingAPendingVolumeToABookAlreadyInTheSaga() throws Exception {
        long saga = saga("Saga");
        long book = book("Presente", ReadingStatus.TO_READ);
        addLinked(saga, book, null, "0");
        var pending = addPending(saga, "Pendiente", null, "1");
        long volumeId = pending.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/link", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(linkBody(book, "2")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_ALREADY_CONTAINS_BOOK"));
    }

    @Test
    void unlinksABookPreservingIdentityPositionLabelAndUsingItsCurrentTitle() throws Exception {
        long saga = saga("Saga");
        long book = book("Título actual", ReadingStatus.READ);
        var linked = addLinked(saga, book, "2", "0");
        long volumeId = linked.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/unlink", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(unlinkBody(null, "1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.volume.id").value(volumeId))
            .andExpect(jsonPath("$.volume.position").value(1))
            .andExpect(jsonPath("$.volume.volumeLabel").value("2"))
            .andExpect(jsonPath("$.volume.bookId").isEmpty())
            .andExpect(jsonPath("$.volume.book").isEmpty())
            .andExpect(jsonPath("$.volume.pendingTitle").value("Título actual"));

        var listed = volumes(saga);
        assertThat(listed.path("volumes").get(0).path("id").asLong()).isEqualTo(volumeId);
        assertThat(listed.path("volumes").get(0).path("pendingTitle").asText()).isEqualTo("Título actual");
    }

    @Test
    void unlinksWithAnExplicitProvisionalTitle() throws Exception {
        long saga = saga("Saga");
        long book = book("Original", ReadingStatus.READ);
        var linked = addLinked(saga, book, null, "0");
        long volumeId = linked.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/unlink", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(unlinkBody("  Otro título  ", "1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.volume.pendingTitle").value("Otro título"))
            .andExpect(jsonPath("$.volume.bookId").isEmpty());
    }

    @Test
    void rejectsUnlinkingAPendingVolume() throws Exception {
        long saga = saga("Saga");
        var pending = addPending(saga, "Pendiente", null, "0");
        long volumeId = pending.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/unlink", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(unlinkBody(null, "1")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_NOT_LINKED"));
    }

    @Test
    void updatesLabelAndPendingTitleWithoutDuplicatingAndTreatsIdenticalValuesAsNoOp() throws Exception {
        long saga = saga("Saga");
        var pending = addPending(saga, "Original", "1", "0");
        long volumeId = pending.path("volume").path("id").asLong();

        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody("Precuela", "Nuevo título", "1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.volume.volumeLabel").value("Precuela"))
            .andExpect(jsonPath("$.volume.pendingTitle").value("Nuevo título"));

        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody("Precuela", "Nuevo título", "2")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"));

        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE saga_id = ?", Long.class, saga)).isEqualTo(1);
    }

    @Test
    void updatesOnlyTheLabelOfALinkedVolumeAndRejectsPendingTitleChanges() throws Exception {
        long saga = saga("Saga");
        long book = book("Libro", ReadingStatus.TO_READ);
        var linked = addLinked(saga, book, null, "0");
        long volumeId = linked.path("volume").path("id").asLong();

        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody("2", null, "1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.volume.volumeLabel").value("2"))
            .andExpect(jsonPath("$.volume.pendingTitle").isEmpty());

        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody("2", "No permitido", "2")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_TARGET_CONFLICT"));
    }

    @Test
    void rejectsClearingTheTitleOfAPendingVolume() throws Exception {
        long saga = saga("Saga");
        var pending = addPending(saga, "Pendiente", null, "0");
        long volumeId = pending.path("volume").path("id").asLong();

        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody(null, null, "1")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_TARGET_REQUIRED"));

        assertThat(volumes(saga).path("revision").asText()).isEqualTo("1");
    }

    @Test
    void rejectsAddingAVolumeWithBothOrNeitherTarget() throws Exception {
        long saga = saga("Saga");
        long book = book("Libro", ReadingStatus.TO_READ);

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(book, "Pendiente", null, "0")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_TARGET_CONFLICT"));

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(null, "   ", null, "0")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_TARGET_REQUIRED"));

        assertThat(volumes(saga).path("volumes")).isEmpty();
    }

    @Test
    void movesVolumesToStartMiddleAndEndShiftingOnlyTheAffectedInterval() throws Exception {
        long saga = saga("Saga");
        long a = pendingId(addPending(saga, "A", null, "0"));
        pendingId(addPending(saga, "B", null, "1"));
        long c = pendingId(addPending(saga, "C", null, "2"));
        long d = pendingId(addPending(saga, "D", null, "3"));

        move(saga, d, 1, "4");
        assertOrder(saga, "5", "D", "A", "B", "C");

        move(saga, a, 4, "5");
        assertOrder(saga, "6", "D", "B", "C", "A");

        move(saga, c, 2, "6");
        assertOrder(saga, "7", "D", "C", "B", "A");
    }

    @Test
    void movingToTheSamePositionIsANoOp() throws Exception {
        long saga = saga("Saga");
        long first = pendingId(addPending(saga, "A", null, "0"));
        addPending(saga, "B", null, "1");
        addPending(saga, "C", null, "2");

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", saga, first)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(1, "3")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("3"))
            .andExpect(jsonPath("$.position").value(1));

        assertOrder(saga, "3", "A", "B", "C");
    }

    @Test
    void rejectsMovePositionsOutsideTheCurrentRange() throws Exception {
        long saga = saga("Saga");
        long first = pendingId(addPending(saga, "A", null, "0"));
        addPending(saga, "B", null, "1");

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", saga, first)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(0, "2")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.toPosition").exists());

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", saga, first)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(3, "2")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_INVALID_POSITION"));
    }

    @Test
    void removesAVolumeAndCompactsLaterPositions() throws Exception {
        long saga = saga("Saga");
        addPending(saga, "A", null, "0");
        long middle = pendingId(addPending(saga, "B", null, "1"));
        addPending(saga, "C", null, "2");

        mvc.perform(delete("/api/sagas/{saga}/volumes/{volume}", saga, middle)
                .param("expectedRevision", "3"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("4"));

        var listed = volumes(saga);
        assertThat(listed.path("revision").asText()).isEqualTo("4");
        assertThat(listed.path("volumes")).hasSize(2);
        assertThat(listed.path("volumes").get(0).path("pendingTitle").asText()).isEqualTo("A");
        assertThat(listed.path("volumes").get(0).path("position").asInt()).isEqualTo(1);
        assertThat(listed.path("volumes").get(1).path("pendingTitle").asText()).isEqualTo("C");
        assertThat(listed.path("volumes").get(1).path("position").asInt()).isEqualTo(2);

        mvc.perform(delete("/api/sagas/{saga}/volumes/{volume}", saga, middle)
                .param("expectedRevision", "4"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_NOT_FOUND"));
    }

    @Test
    void rejectsStaleRevisionsOnEveryMutation() throws Exception {
        long saga = saga("Saga");
        long firstBook = book("Primero", ReadingStatus.TO_READ);
        long secondBook = book("Segundo", ReadingStatus.TO_READ);
        var pending = addPending(saga, "Pendiente", null, "0");
        long pendingId = pending.path("volume").path("id").asLong();
        var linked = addLinked(saga, firstBook, null, "1");
        long linkedId = linked.path("volume").path("id").asLong();

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(null, "Otra", null, "9")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));
        mvc.perform(put("/api/sagas/{saga}/volumes/{volume}", saga, pendingId)
                .contentType(MediaType.APPLICATION_JSON).content(updateBody("9", "Otra", "9")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));
        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", saga, pendingId)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(2, "9")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));
        mvc.perform(delete("/api/sagas/{saga}/volumes/{volume}", saga, pendingId)
                .param("expectedRevision", "9"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));
        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/link", saga, pendingId)
                .contentType(MediaType.APPLICATION_JSON).content(linkBody(secondBook, "9")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));
        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/unlink", saga, linkedId)
                .contentType(MediaType.APPLICATION_JSON).content(unlinkBody(null, "9")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SAGA_REVISION_CONFLICT"));

        var listed = volumes(saga);
        assertThat(listed.path("revision").asText()).isEqualTo("2");
        assertThat(listed.path("volumes")).hasSize(2);
        assertThat(listed.path("volumes").get(1).path("pendingTitle").isNull()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1", "01", "+1", "1.0", " 0", "1e2", "9223372036854775808"})
    void rejectsInvalidRevisionFormatsOnVolumeWrites(String revision) throws Exception {
        long saga = saga("Saga");

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(null, "Pendiente", null, revision)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));

        mvc.perform(delete("/api/sagas/{saga}/volumes/1", saga).param("expectedRevision", revision))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SAGA_INVALID_REQUEST"));
    }

    @Test
    void rejectsNonStringOrMissingRevisionsInJsonBodies() throws Exception {
        long saga = saga("Saga");

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content("{\"pendingTitle\":\"Pendiente\",\"expectedRevision\":0}"))
            .andExpect(status().isBadRequest());

        mvc.perform(post("/api/sagas/{saga}/volumes", saga).contentType(MediaType.APPLICATION_JSON)
                .content("{\"pendingTitle\":\"Pendiente\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.expectedRevision").exists());
    }

    @Test
    void reportsDerivedProgressOnTheSagaListDetailAndVolumes() throws Exception {
        long saga = saga("Progreso");
        addLinked(saga, book("Leído", ReadingStatus.READ), "1", "0");
        addLinked(saga, book("Leyendo", ReadingStatus.READING), "2", "1");
        addLinked(saga, book("Por leer", ReadingStatus.TO_READ), "3", "2");
        addLinked(saga, book("Abandonado", ReadingStatus.ABANDONED), "4", "3");
        addPending(saga, "Pendiente", "5", "4");

        for (JsonNode progress : List.of(
            detail(saga).path("progress"),
            volumes(saga).path("progress"),
            listByName("Progreso").path("content").get(0).path("progress"))) {
            assertThat(progress.path("total").asInt()).isEqualTo(5);
            assertThat(progress.path("linked").asInt()).isEqualTo(4);
            assertThat(progress.path("pending").asInt()).isEqualTo(1);
            assertThat(progress.path("read").asInt()).isEqualTo(1);
            assertThat(progress.path("reading").asInt()).isEqualTo(1);
            assertThat(progress.path("toRead").asInt()).isEqualTo(1);
            assertThat(progress.path("abandoned").asInt()).isEqualTo(1);
        }
    }

    @Test
    void deletingABookDetachesItsVolumesInEverySagaAndKeepsTheReadingListConsistent() throws Exception {
        long book = book("Libro borrado", ReadingStatus.READ);
        long first = saga("Primera");
        long second = saga("Segunda");
        var firstLinked = addLinked(first, book, "2", "0");
        addPending(first, "Pendiente de la primera", null, "1");
        addPending(second, "Pendiente de la segunda", null, "0");
        addLinked(second, book, "7", "1");

        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON)
                .content("{\"bookId\":" + book + ",\"expectedRevision\":\"0\"}"))
            .andExpect(status().isCreated());

        mvc.perform(delete("/api/books/{id}", book)).andExpect(status().isNoContent());
        mvc.perform(get("/api/books/{id}", book)).andExpect(status().isNotFound());

        var firstVolumes = volumes(first);
        assertThat(firstVolumes.path("revision").asText()).isEqualTo("3");
        assertThat(firstVolumes.path("volumes").get(0).path("id").asLong())
            .isEqualTo(firstLinked.path("volume").path("id").asLong());
        assertThat(firstVolumes.path("volumes").get(0).path("position").asInt()).isEqualTo(1);
        assertThat(firstVolumes.path("volumes").get(0).path("volumeLabel").asText()).isEqualTo("2");
        assertThat(firstVolumes.path("volumes").get(0).path("bookId").isNull()).isTrue();
        assertThat(firstVolumes.path("volumes").get(0).path("pendingTitle").asText())
            .isEqualTo("Libro borrado");
        assertThat(firstVolumes.path("volumes").get(1).path("position").asInt()).isEqualTo(2);

        var secondVolumes = volumes(second);
        assertThat(secondVolumes.path("revision").asText()).isEqualTo("3");
        assertThat(secondVolumes.path("volumes").get(1).path("position").asInt()).isEqualTo(2);
        assertThat(secondVolumes.path("volumes").get(1).path("volumeLabel").asText()).isEqualTo("7");
        assertThat(secondVolumes.path("volumes").get(1).path("bookId").isNull()).isTrue();
        assertThat(secondVolumes.path("volumes").get(1).path("pendingTitle").asText())
            .isEqualTo("Libro borrado");

        mvc.perform(get("/api/reading-list"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2"))
            .andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    void deletingASagaRemovesItsVolumesButKeepsTheBooks() throws Exception {
        long saga = saga("Saga");
        long book = book("Libro conservado", ReadingStatus.TO_READ);
        addLinked(saga, book, null, "0");

        mvc.perform(delete("/api/sagas/{id}", saga).param("expectedRevision", "1"))
            .andExpect(status().isNoContent());

        mvc.perform(get("/api/books/{id}", book)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE saga_id = ?", Long.class, saga)).isZero();
    }

    @Test
    void missingSagaOrVolumeReturnsProblemDetail() throws Exception {
        long saga = saga("Saga");
        var volume = addPending(saga, "Pendiente", null, "0");
        long volumeId = volume.path("volume").path("id").asLong();
        long other = saga("Otra");

        mvc.perform(get("/api/sagas/{saga}/volumes", 9_000_000L))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_NOT_FOUND"));

        mvc.perform(get("/api/sagas/{saga}/volumes", other))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.volumes").isEmpty());

        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", other, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(1, "0")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SAGA_VOLUME_NOT_FOUND"));
    }

    private long saga(String name) throws Exception {
        var result = mvc.perform(post("/api/sagas").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":" + json.writeValueAsString(name) + "}"))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).path("id").asLong();
    }

    private long book(String title, ReadingStatus status) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Autora");
        book.setReadingStatus(status);
        return books.saveAndFlush(book).getId();
    }

    private JsonNode addPending(long saga, String title, String label, String revision) throws Exception {
        var result = mvc.perform(post("/api/sagas/{saga}/volumes", saga)
                .contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(null, title, label, revision)))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode addLinked(long saga, long bookId, String label, String revision) throws Exception {
        var result = mvc.perform(post("/api/sagas/{saga}/volumes", saga)
                .contentType(MediaType.APPLICATION_JSON)
                .content(volumeBody(bookId, null, label, revision)))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"))
            .andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private long pendingId(JsonNode response) {
        return response.path("volume").path("id").asLong();
    }

    private void move(long saga, long volumeId, int position, String revision) throws Exception {
        mvc.perform(post("/api/sagas/{saga}/volumes/{volume}/move", saga, volumeId)
                .contentType(MediaType.APPLICATION_JSON).content(moveBody(position, revision)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.position").value(position));
    }

    private void assertOrder(long saga, String revision, String... titles) throws Exception {
        var listed = volumes(saga);
        assertThat(listed.path("revision").asText()).isEqualTo(revision);
        assertThat(listed.path("volumes")).hasSize(titles.length);
        for (int index = 0; index < titles.length; index++) {
            JsonNode volume = listed.path("volumes").get(index);
            assertThat(volume.path("position").asInt()).isEqualTo(index + 1);
            String title = volume.path("book").isNull()
                ? volume.path("pendingTitle").asText()
                : volume.path("book").path("title").asText();
            assertThat(title).isEqualTo(titles[index]);
        }
    }

    private JsonNode volumes(long saga) throws Exception {
        var result = mvc.perform(get("/api/sagas/{saga}/volumes", saga))
            .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode detail(long saga) throws Exception {
        var result = mvc.perform(get("/api/sagas/{id}", saga))
            .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode listByName(String name) throws Exception {
        var result = mvc.perform(get("/api/sagas").param("name", name))
            .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private String volumeBody(Long bookId, String pendingTitle, String volumeLabel, String revision) throws Exception {
        var node = json.createObjectNode();
        if (bookId == null) {
            node.putNull("bookId");
        } else {
            node.put("bookId", bookId);
        }
        if (pendingTitle == null) {
            node.putNull("pendingTitle");
        } else {
            node.put("pendingTitle", pendingTitle);
        }
        if (volumeLabel == null) {
            node.putNull("volumeLabel");
        } else {
            node.put("volumeLabel", volumeLabel);
        }
        node.put("expectedRevision", revision);
        return json.writeValueAsString(node);
    }

    private String updateBody(String volumeLabel, String pendingTitle, String revision) throws Exception {
        return volumeBody(null, pendingTitle, volumeLabel, revision);
    }

    private String linkBody(long bookId, String revision) throws Exception {
        var node = json.createObjectNode();
        node.put("bookId", bookId);
        node.put("expectedRevision", revision);
        return json.writeValueAsString(node);
    }

    private String unlinkBody(String pendingTitle, String revision) throws Exception {
        var node = json.createObjectNode();
        if (pendingTitle == null) {
            node.putNull("pendingTitle");
        } else {
            node.put("pendingTitle", pendingTitle);
        }
        node.put("expectedRevision", revision);
        return json.writeValueAsString(node);
    }

    private String moveBody(int toPosition, String revision) throws Exception {
        var node = json.createObjectNode();
        node.put("toPosition", toPosition);
        node.put("expectedRevision", revision);
        return json.writeValueAsString(node);
    }
}

package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class SagaVolumeSchemaTest {

    @Autowired private JdbcTemplate jdbc;

    @Test
    void flywayAppliedVersionThirteen() {
        Boolean success = jdbc.queryForObject(
            "SELECT success FROM flyway_schema_history WHERE version = '13'", Boolean.class);
        assertThat(success).isTrue();
    }

    @Test
    void tableHasTheExpectedColumnsAndLengths() {
        List<Map<String, Object>> columns = jdbc.queryForList(
            "SELECT column_name, character_maximum_length FROM information_schema.columns "
                + "WHERE table_schema = 'public' AND table_name = 'saga_volume' ORDER BY ordinal_position");

        assertThat(columns).extracting(column -> column.get("column_name"))
            .containsExactly("id", "saga_id", "book_id", "position", "volume_label",
                "pending_title", "created_at", "updated_at");
        assertThat(lengthOf(columns, "volume_label")).isEqualTo(40);
        assertThat(lengthOf(columns, "pending_title")).isEqualTo(255);
    }

    @Test
    void foreignKeysCascadeFromSagaAndRestrictBookDeletion() {
        assertThat(deleteAction("fk_saga_volume_saga")).isEqualTo("c");
        assertThat(deleteAction("fk_saga_volume_book")).isEqualTo("r");
    }

    @Test
    void positionUniqueConstraintIsDeferrableImmediate() {
        assertThat(jdbc.queryForObject("""
            SELECT condeferrable AND NOT condeferred FROM pg_constraint
            WHERE conrelid = 'public.saga_volume'::regclass AND conname = 'uq_saga_volume_position'
            """, Boolean.class)).isTrue();
    }

    @Test
    void checksAndIndexesExist() {
        List<String> constraints = jdbc.queryForList(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'public.saga_volume'::regclass", String.class);
        assertThat(constraints).contains("ck_saga_volume_position", "ck_saga_volume_target",
            "uq_saga_volume_book", "uq_saga_volume_position");

        List<String> indexes = jdbc.queryForList(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'saga_volume'",
            String.class);
        assertThat(indexes).contains("ix_saga_volume_book", "ix_saga_volume_saga_ordered");
    }

    @Test
    void rejectsDuplicateBookInTheSameSaga() {
        long saga = saga();
        long book = book("Libro");
        jdbc.update("INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 1)", saga, book);

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 2)", saga, book))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void allowsTheSameBookInDifferentSagas() {
        long first = saga();
        long second = saga();
        long book = book("Libro compartido");
        jdbc.update("INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 1)", first, book);
        jdbc.update("INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 1)", second, book);

        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE book_id = ?", Long.class, book)).isEqualTo(2);
    }

    @Test
    void rejectsDuplicatePositionInsideOneSaga() {
        long saga = saga();
        jdbc.update("INSERT INTO public.saga_volume (saga_id, pending_title, position) VALUES (?, 'Uno', 1)", saga);

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, pending_title, position) VALUES (?, 'Dos', 1)", saga))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void rejectsNonPositivePositions() {
        long saga = saga();

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, pending_title, position) VALUES (?, 'Uno', 0)", saga))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void rejectsBothBookAndPendingTitle() {
        long saga = saga();
        long book = book("Libro");

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, book_id, pending_title, position) VALUES (?, ?, 'Ambos', 1)",
            saga, book))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void rejectsNeitherBookNorPendingTitle() {
        long saga = saga();

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, position) VALUES (?, 1)", saga))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void rejectsBlankPendingTitle() {
        long saga = saga();

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga_volume (saga_id, pending_title, position) VALUES (?, '   ', 1)", saga))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void databaseRejectsDeletingALinkedBook() {
        long saga = saga();
        long book = book("Libro vinculado");
        jdbc.update("INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 1)", saga, book);

        assertThatThrownBy(() -> jdbc.update("DELETE FROM public.book WHERE id = ?", book))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void deletingSagaCascadesVolumesWithoutDeletingBooks() {
        long saga = saga();
        long book = book("Libro conservado");
        jdbc.update("INSERT INTO public.saga_volume (saga_id, book_id, position) VALUES (?, ?, 1)", saga, book);

        jdbc.update("DELETE FROM public.saga WHERE id = ?", saga);

        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga_volume WHERE saga_id = ?", Long.class, saga)).isZero();
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.book WHERE id = ?", Long.class, book)).isEqualTo(1);
    }

    private Integer lengthOf(List<Map<String, Object>> columns, String name) {
        return columns.stream()
            .filter(column -> name.equals(column.get("column_name")))
            .map(column -> (Integer) column.get("character_maximum_length"))
            .findFirst()
            .orElseThrow();
    }

    private String deleteAction(String constraint) {
        return jdbc.queryForObject("""
            SELECT confdeltype::text FROM pg_constraint
            WHERE conrelid = 'public.saga_volume'::regclass AND conname = ?
            """, String.class, constraint);
    }

    private long saga() {
        return jdbc.queryForObject(
            "INSERT INTO public.saga (name) VALUES (?) RETURNING id", Long.class,
            "Saga " + System.nanoTime());
    }

    private long book(String title) {
        return jdbc.queryForObject(
            "INSERT INTO public.book (title, author) VALUES (?, 'Autora') RETURNING id", Long.class, title);
    }
}

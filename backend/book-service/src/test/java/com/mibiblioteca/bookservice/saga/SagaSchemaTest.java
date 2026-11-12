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
class SagaSchemaTest {

    @Autowired private JdbcTemplate jdbc;

    @Test
    void flywayAppliedVersionTwelve() {
        Boolean success = jdbc.queryForObject(
            "SELECT success FROM flyway_schema_history WHERE version = '12'", Boolean.class);
        assertThat(success).isTrue();
    }

    @Test
    void sagaTableHasTheExpectedColumnsAndLengths() {
        List<Map<String, Object>> columns = jdbc.queryForList(
            "SELECT column_name, data_type, character_maximum_length "
                + "FROM information_schema.columns "
                + "WHERE table_schema = 'public' AND table_name = 'saga' ORDER BY ordinal_position");

        assertThat(columns).extracting(column -> column.get("column_name"))
            .containsExactly("id", "name", "author", "description", "image_url",
                "revision", "created_at", "updated_at");
        assertThat(lengthOf(columns, "name")).isEqualTo(255);
        assertThat(lengthOf(columns, "author")).isEqualTo(255);
        assertThat(lengthOf(columns, "image_url")).isEqualTo(2048);
    }

    @Test
    void sagaTableHasCheckConstraintsAndTheNameAuthorUniqueIndex() {
        List<String> constraints = jdbc.queryForList(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'public.saga'::regclass", String.class);
        assertThat(constraints).contains("ck_saga_name_not_blank", "ck_saga_revision");

        List<String> indexes = jdbc.queryForList(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'saga'",
            String.class);
        assertThat(indexes).contains("uq_saga_name_author");
    }

    @Test
    void databaseRejectsBlankNames() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO public.saga (name) VALUES ('   ')"))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void databaseRejectsNegativeRevisions() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO public.saga (name, revision) VALUES ('Saga', -1)"))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void databaseRejectsDuplicateNameAndAuthorIgnoringCaseAndOuterSpaces() {
        jdbc.update("INSERT INTO public.saga (name, author) VALUES ('Saga Uno', 'Autora')");

        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO public.saga (name, author) VALUES ('  saga uno  ', '  AUTORA  ')"))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    void databaseAllowsSameNameForDifferentAuthors() {
        jdbc.update("INSERT INTO public.saga (name, author) VALUES ('Saga compartida', 'Autora uno')");
        jdbc.update("INSERT INTO public.saga (name, author) VALUES ('Saga compartida', 'Autora dos')");

        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM public.saga WHERE name = 'Saga compartida'", Long.class)).isEqualTo(2);
    }

    private Integer lengthOf(List<Map<String, Object>> columns, String name) {
        return columns.stream()
            .filter(column -> name.equals(column.get("column_name")))
            .map(column -> (Integer) column.get("character_maximum_length"))
            .findFirst()
            .orElseThrow();
    }
}

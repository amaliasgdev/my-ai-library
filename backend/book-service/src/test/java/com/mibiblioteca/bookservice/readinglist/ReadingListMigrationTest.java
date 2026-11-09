package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Objects;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Real Flyway history, including V10's explicitly public-qualified DDL. */
class ReadingListMigrationTest {
    private static final String DATABASE = "bookdb_tests_reading_list_migration";
    private static final String URL = "jdbc:postgresql://127.0.0.1:5433/" + DATABASE;
    private DriverManagerDataSource dataSource;
    private JdbcTemplate jdbc;

    @BeforeEach
    void resetOnlyTheExplicitlyDisposableMigrationDatabase() throws Exception {
        if (!Objects.equals(System.getenv("TEST_DB_URL"), "jdbc:postgresql://127.0.0.1:5433/bookdb_tests")
            || !Objects.equals(System.getenv("TEST_DB_USERNAME"), "booktest")) {
            throw new IllegalStateException("Load the isolated test configuration; no fallback is permitted");
        }
        String password = System.getenv("TEST_DB_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("Missing TEST_DB_PASSWORD");
        }
        dataSource = new DriverManagerDataSource(URL, "booktest", password);
        jdbc = new JdbcTemplate(dataSource);
        verifyDestination();
        // The only clean in this test: fixed disposable database + public schema.
        Flyway.configure().dataSource(dataSource).schemas("public").defaultSchema("public")
            .cleanDisabled(false).load().clean();
    }

    private void verifyDestination() throws Exception {
        try (var connection = dataSource.getConnection()) {
            connection.setReadOnly(true);
            try (var statement = connection.createStatement(); var result = statement.executeQuery("""
                SELECT current_database(), current_user,
                  (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication
                     FROM pg_roles WHERE rolname=current_user),
                  EXISTS(SELECT FROM pg_database WHERE datname IN ('bookdb','bookdb_restore_test')),
                  EXISTS(SELECT FROM pg_roles WHERE rolname='booksvc'),
                  current_setting('server_version_num')::integer
                """)) {
                if (!result.next() || !DATABASE.equals(result.getString(1))
                    || !"booktest".equals(result.getString(2)) || result.getBoolean(3)
                    || result.getBoolean(4) || result.getBoolean(5)
                    || result.getInt(6) < 160000 || result.getInt(6) >= 170000) {
                    throw new IllegalStateException("Unsafe migration test destination");
                }
            }
        }
    }

    private Flyway migrateTo(String target) throws Exception {
        verifyDestination();
        Flyway flyway = Flyway.configure().dataSource(dataSource)
            .schemas("public").defaultSchema("public").locations("classpath:db/migration")
            .target(target).cleanDisabled(true).load();
        flyway.migrate();
        flyway.validate();
        return flyway;
    }

    @Test
    void initializesAnEmptyDatabaseThroughV11WithOnlyTheExpectedTablesAndConstraints() throws Exception {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_tables WHERE schemaname='public'", Integer.class)).isZero();
        assertThat(migrateTo("11").info().current().getVersion().getVersion()).isEqualTo("11");
        assertThat(jdbc.queryForList("SELECT tablename FROM pg_tables WHERE schemaname='public'", String.class))
            .containsExactlyInAnyOrder("book", "flyway_schema_history", "reading_list", "reading_list_entry");
        assertThat(jdbc.queryForList("SELECT id FROM public.reading_list", Long.class)).containsExactly(1L);
        assertThat(jdbc.queryForObject("SELECT revision FROM public.reading_list WHERE id=1", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.reading_list_entry", Integer.class)).isZero();
        assertThat(jdbc.queryForList("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='reading_list_entry'
            """, String.class)).containsExactlyInAnyOrder("id", "reading_list_id", "book_id", "position", "added_at");
        assertThat(jdbc.queryForList("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='reading_list_entry' AND is_nullable='NO'
            """, String.class)).hasSize(5);
        assertThat(jdbc.queryForObject("""
            SELECT condeferrable AND NOT condeferred FROM pg_constraint
            WHERE conrelid='public.reading_list_entry'::regclass AND conname='uq_reading_list_entry_position'
            """, Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("""
            SELECT confdeltype::text FROM pg_constraint
            WHERE conrelid='public.reading_list_entry'::regclass AND conname='fk_reading_list_entry_book'
              AND confrelid='public.book'::regclass
            """, String.class)).isEqualTo("c");
        assertThat(jdbc.queryForObject("""
            SELECT confdeltype::text FROM pg_constraint
            WHERE conrelid='public.reading_list_entry'::regclass AND conname='fk_reading_list_entry_list'
              AND confrelid='public.reading_list'::regclass
            """, String.class)).isEqualTo("r");
        assertThat(jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='reading_list_entry'", String.class))
            .containsExactlyInAnyOrder("reading_list_entry_pkey", "uq_reading_list_entry_book",
                "uq_reading_list_entry_position", "ix_reading_list_entry_book");
        assertThat(jdbc.queryForObject("""
            SELECT data_type FROM information_schema.columns
            WHERE table_schema='public' AND table_name='reading_list_entry' AND column_name='added_at'
            """, String.class)).isEqualTo("timestamp with time zone");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.flyway_schema_history WHERE success", Integer.class)).isEqualTo(11);
    }

    @Test
    void upgradesV10WithoutChangingAnyExistingBookDataHistoryConstraintsIndexesOrSequence() throws Exception {
        migrateTo("10");
        jdbc.update("""
            INSERT INTO public.book(title,author,isbn,description,cover_url,publisher,publication_year,
              page_count,language,genres,reading_status,rating,started_on,finished_on,created_at,updated_at)
            VALUES ('Título','Autora','9780132350884','Descripción',
              'https://example.org/cover.jpg','Editorial',2008,464,'es',ARRAY['Ensayo','Técnica'],
              'READ',5,DATE '2026-01-01',DATE '2026-02-02',
              TIMESTAMPTZ '2026-01-01 10:00:00Z',TIMESTAMPTZ '2026-02-02 11:00:00Z'),
              ('Sin metadatos','Autor',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','TO_READ',NULL,NULL,NULL,
              TIMESTAMPTZ '2026-01-01 10:00:00Z',TIMESTAMPTZ '2026-01-01 10:00:00Z')
            """);
        String before = preservedState();
        migrateTo("11");
        assertThat(preservedState()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT revision FROM public.reading_list WHERE id=1", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.reading_list_entry", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT success FROM public.flyway_schema_history WHERE version='11'", Boolean.class)).isTrue();
    }

    private String preservedState() {
        return jdbc.queryForObject("""
            SELECT jsonb_build_object(
              'books',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.book b),
              'rowVersions',(SELECT jsonb_agg(jsonb_build_array(id,xmin::text,ctid::text) ORDER BY id) FROM public.book),
              'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY installed_rank) FROM public.flyway_schema_history h WHERE version <> '11'),
              'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname)
                FROM pg_constraint WHERE conrelid='public.book'::regclass),
              'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname)
                FROM pg_indexes WHERE schemaname='public' AND tablename='book'),
              'sequence',(SELECT jsonb_build_array(last_value,is_called) FROM public.book_id_seq)
            )::text
            """, String.class);
    }
}

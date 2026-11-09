package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.Transactional;

/** Rebuilds V7-V9 inside a rolled-back transaction, on the guarded test cluster only. */
@SpringBootTest
@Transactional
class PhysicalLocationRetirementMigrationTest {
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void preservesAllRemainingBookDataAndOwnedObjects() {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            prepareV9(connection);
            String before = preservedState();
            migrate(connection, "V10__remove_physical_locations_and_inventory.sql");
            assertThat(preservedState()).isEqualTo(before);
            assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='public' AND table_name='book'
                  AND column_name IN ('room','bookcase','shelf','shelf_id')
                """, Integer.class)).isZero();
            assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname IN
                  ('room','bookcase','shelf','inventory_session','room_id_seq','bookcase_id_seq',
                   'shelf_id_seq','inventory_session_id_seq','ix_book_shelf')
                """, Integer.class)).isZero();
            return null;
        });
    }

    @Test
    void unexpectedDependencyFailsWithoutCascadeAndTransactionRestoresEarlierDdl() {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            prepareV9(connection);
            jdbc.execute("CREATE TABLE public.v10_dependency_probe (room_id bigint REFERENCES public.room(id))");
            String before = preservedState();
            var savepoint = connection.setSavepoint();
            assertThatThrownBy(() -> migrate(connection, "V10__remove_physical_locations_and_inventory.sql"))
                .isInstanceOf(ScriptException.class);
            connection.rollback(savepoint);
            assertThat(preservedState()).isEqualTo(before);
            assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema='public' AND table_name='book'
                  AND column_name IN ('room','bookcase','shelf','shelf_id')
                """, Integer.class)).isEqualTo(4);
            assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_tables WHERE schemaname='public'
                  AND tablename IN ('room','bookcase','shelf','inventory_session','v10_dependency_probe')
                """, Integer.class)).isEqualTo(5);
            assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_constraint WHERE conrelid='public.book'::regclass
                  AND conname IN ('fk_book_shelf','ck_book_location')
                """, Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT to_regclass('public.ix_book_shelf') IS NOT NULL", Boolean.class)).isTrue();
            return null;
        });
    }

    private void prepareV9(Connection connection) {
        assertThat(jdbc.queryForObject("SELECT current_database()", String.class)).isEqualTo("bookdb_tests");
        jdbc.execute("SET LOCAL search_path TO public");
        migrate(connection, "V7__add_book_location.sql");
        migrate(connection, "V8__add_library_shelves.sql");
        migrate(connection, "V9__create_inventory_session.sql");
        jdbc.execute("""
            INSERT INTO public.room(name) VALUES ('Salón');
            INSERT INTO public.bookcase(room_id,name) SELECT id,'Estantería' FROM public.room;
            INSERT INTO public.shelf(bookcase_id,name) SELECT id,'Superior' FROM public.bookcase;
            INSERT INTO public.inventory_session(shelf_id,status,notes,started_at,created_at,updated_at)
              SELECT id,'IN_PROGRESS','Notas conservadas hasta la retirada',now(),now(),now() FROM public.shelf;
            INSERT INTO public.book(title,author,isbn,description,cover_url,publisher,publication_year,
              page_count,language,genres,reading_status,rating,started_on,finished_on,created_at,updated_at,
              shelf_id)
              SELECT 'Título con acentos','Autora','9780132350884','Descripción',
                'https://example.org/cover.jpg','Editorial',2008,464,'es',ARRAY['Ensayo','Técnica'],
                'READ',5,DATE '2026-01-01',DATE '2026-02-02',now(),now(),id FROM public.shelf;
            INSERT INTO public.book(title,author,room,bookcase,shelf,created_at,updated_at)
              VALUES ('Legacy','Autor','Habitación','Mueble','3',now(),now());
            """);
    }

    private String preservedState() {
        return jdbc.queryForObject("""
            SELECT jsonb_build_object(
              'books',(SELECT jsonb_agg(to_jsonb(b)-ARRAY['room','bookcase','shelf','shelf_id'] ORDER BY id) FROM public.book b),
              'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY installed_rank) FROM public.flyway_schema_history h),
              'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname)
                FROM pg_constraint WHERE conrelid='public.book'::regclass AND conname NOT IN ('fk_book_shelf','ck_book_location')),
              'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes
                WHERE schemaname='public' AND tablename='book' AND indexname <> 'ix_book_shelf'),
              'sequence',(SELECT jsonb_build_array(last_value,is_called) FROM public.book_id_seq)
            )::text
            """, String.class);
    }

    private void migrate(Connection connection, String file) {
        ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/" + file));
    }
}

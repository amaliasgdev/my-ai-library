package com.mibiblioteca.bookservice.location;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.book.persistence.Book;
import java.sql.*;
import java.util.UUID;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class LocationMigrationTest {
    @Autowired private DataSource dataSource;
    @Test void v8PreservesV7LabelsAndAddsOnlyEmptyStructuresWithRestrictiveConstraints() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(jdbc.queryForObject("show server_version", String.class)).startsWith("16.");
        String schema = "shelves_test_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE SCHEMA " + schema);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target("7").load().migrate();
            for (String[] values : new String[][]{{"Salón", "Billy", "1"}, {"Salón", "Billy", "2"}, {"Dormitorio", null, null}, {null, "Estantería", "Superior"}, {null, null, "3"}}) {
                jdbc.update("INSERT INTO " + schema + ".book(title,author,room,bookcase,shelf) VALUES ('V7','Author',?,?,?)", (Object[]) values);
            }
            var before = jdbc.queryForList("SELECT id,room,bookcase,shelf FROM " + schema + ".book ORDER BY id");
            var flyway = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load();
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1); flyway.validate();
            assertThat(jdbc.queryForList("SELECT id,room,bookcase,shelf FROM " + schema + ".book ORDER BY id")).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".book WHERE shelf_id IS NOT NULL", Long.class)).isZero();
            for (String table : new String[]{"room", "bookcase", "shelf"}) assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + "." + table, Long.class)).isZero();
            var indexes = jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE schemaname=? AND tablename IN ('room','bookcase','shelf')", String.class, schema);
            assertThat(indexes).containsExactlyInAnyOrder("room_pkey", "bookcase_pkey", "shelf_pkey", "uq_room_name", "uq_bookcase_name", "uq_shelf_name");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname=? AND indexname='ix_book_shelf'", Long.class, schema)).isEqualTo(1);
            long room = jdbc.queryForObject("INSERT INTO " + schema + ".room(name) VALUES ('Salón') RETURNING id", Long.class);
            long bookcase = jdbc.queryForObject("INSERT INTO " + schema + ".bookcase(room_id,name) VALUES (?, 'Billy') RETURNING id", Long.class, room);
            long shelf = jdbc.queryForObject("INSERT INTO " + schema + ".shelf(bookcase_id,name) VALUES (?, '3') RETURNING id", Long.class, bookcase);
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".book SET shelf_id=? WHERE id=1", shelf)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            jdbc.update("UPDATE " + schema + ".book SET room=NULL,bookcase=NULL,shelf=NULL,shelf_id=? WHERE id=1", shelf);
            assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".shelf WHERE id=?", shelf)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".bookcase WHERE id=?", bookcase)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".room WHERE id=?", room)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".book SET shelf_id=999999 WHERE id=1")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            Configuration configuration = new Configuration().addAnnotatedClass(Book.class).addAnnotatedClass(Room.class).addAnnotatedClass(Bookcase.class).addAnnotatedClass(Shelf.class)
                .setProperty("hibernate.hbm2ddl.auto", "validate").setProperty("hibernate.default_schema", schema);
            configuration.setPhysicalNamingStrategy(new org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy());
            configuration.getProperties().put("hibernate.connection.datasource", dataSource);
            try (var factory = configuration.buildSessionFactory()) { assertThat(factory.isOpen()).isTrue(); }
            duplicateRace(schema);
        } finally {
            // Only this test's isolated schema, never application tables or volumes.
            for (String table : new String[]{"book", "shelf", "bookcase", "room", "flyway_schema_history"}) jdbc.execute("DROP TABLE IF EXISTS " + schema + "." + table);
            jdbc.execute("DROP SCHEMA " + schema);
        }
    }

    private void duplicateRace(String schema) throws Exception {
        try (Connection first = dataSource.getConnection(); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            first.setAutoCommit(false);
            try (var statement = first.prepareStatement("INSERT INTO " + schema + ".room(name) VALUES ('Race')")) { statement.executeUpdate(); }
            var started = new CountDownLatch(1);
            Future<String> second = executor.submit(() -> {
                try (var connection = dataSource.getConnection(); var statement = connection.prepareStatement("INSERT INTO " + schema + ".room(name) VALUES ('race')")) {
                    statement.setQueryTimeout(5); started.countDown(); statement.executeUpdate(); return "inserted";
                } catch (SQLException ex) { return ex.getSQLState(); }
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue(); first.commit();
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo("23505");
        }
    }
}

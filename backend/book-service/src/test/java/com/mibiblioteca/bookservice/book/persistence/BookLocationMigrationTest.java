package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import javax.sql.DataSource;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class BookLocationMigrationTest {
    @Autowired private DataSource dataSource;

    @Test void v7PreservesV6RowsAndHibernateValidatesTheMigratedSchema() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(jdbc.queryForObject("show server_version", String.class)).startsWith("16.");
        // Own isolated schema only: never clean or drop the application's schema/data.
        String schema = "location_test_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE SCHEMA " + schema);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .locations("classpath:db/migration").target("6").load().migrate();
            jdbc.update("INSERT INTO " + schema + ".book(title,author) VALUES ('Existing V6','Author')");
            Flyway migrated = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .locations("classpath:db/migration").target("7").load();
            assertThat(migrated.migrate().migrationsExecuted).isEqualTo(1); migrated.validate();
            var row = jdbc.queryForMap("SELECT title,room,bookcase,shelf FROM " + schema + ".book");
            assertThat(row.get("title")).isEqualTo("Existing V6");
            for (String field : new String[]{"room", "bookcase", "shelf"}) {
                assertThat(row.get(field)).isNull();
                var column = jdbc.queryForMap("SELECT is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema=? AND table_name='book' AND column_name=?", schema, field);
                assertThat(column.get("is_nullable")).isEqualTo("YES"); assertThat(column.get("column_default")).isNull();
                assertThat(column.get("character_maximum_length")).isEqualTo(field.equals("shelf") ? 50 : 100);
            }
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
            Configuration configuration = new Configuration().addAnnotatedClass(Book.class)
                .addAnnotatedClass(com.mibiblioteca.bookservice.location.Room.class)
                .addAnnotatedClass(com.mibiblioteca.bookservice.location.Bookcase.class)
                .addAnnotatedClass(com.mibiblioteca.bookservice.location.Shelf.class)
                .setProperty("hibernate.hbm2ddl.auto", "validate").setProperty("hibernate.default_schema", schema);
            configuration.setPhysicalNamingStrategy(new org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy());
            configuration.getProperties().put("hibernate.connection.datasource", dataSource);
            try (var factory = configuration.buildSessionFactory()) { assertThat(factory.isOpen()).isTrue(); }
        } finally {
            jdbc.execute("DROP TABLE IF EXISTS " + schema + ".book");
            jdbc.execute("DROP TABLE IF EXISTS " + schema + ".shelf");
            jdbc.execute("DROP TABLE IF EXISTS " + schema + ".bookcase");
            jdbc.execute("DROP TABLE IF EXISTS " + schema + ".room");
            jdbc.execute("DROP TABLE IF EXISTS " + schema + ".flyway_schema_history");
            jdbc.execute("DROP SCHEMA " + schema);
        }
    }
}

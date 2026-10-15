package com.mibiblioteca.bookservice.inventory;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.location.*;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class InventorySessionMigrationTest {
    @Autowired DataSource dataSource;
    @Test void v8ToV9PreservesDataValidatesHibernateAndEnforcesConstraintsOnPostgres16() {
        var jdbc=new JdbcTemplate(dataSource); String schema="inventory_test_"+UUID.randomUUID().toString().replace("-","");
        jdbc.execute("CREATE SCHEMA "+schema);
        try {
            assertThat(jdbc.queryForObject("show server_version",String.class)).startsWith("16.");
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("8").load().migrate();
            jdbc.update("INSERT INTO "+schema+".room(name) VALUES ('Room')");
            jdbc.update("INSERT INTO "+schema+".bookcase(room_id,name) VALUES (1,'Case')");
            jdbc.update("INSERT INTO "+schema+".shelf(bookcase_id,name) VALUES (1,'Shelf')");
            jdbc.update("INSERT INTO "+schema+".book(title,author,shelf_id) VALUES ('Book','Author',1)");
            var before=jdbc.queryForList("SELECT row_to_json(b)::text FROM "+schema+".book b",String.class);
            var flyway=Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load();
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1); flyway.validate();
            assertThat(jdbc.queryForList("SELECT row_to_json(b)::text FROM "+schema+".book b",String.class)).isEqualTo(before);
            var config=new Configuration().addAnnotatedClass(Book.class).addAnnotatedClass(Room.class).addAnnotatedClass(Bookcase.class).addAnnotatedClass(Shelf.class).addAnnotatedClass(InventorySession.class)
                .setProperty("hibernate.hbm2ddl.auto","validate").setProperty("hibernate.default_schema",schema);
            config.setPhysicalNamingStrategy(new org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy()); config.getProperties().put("hibernate.connection.datasource",dataSource);
            try(var factory=config.buildSessionFactory()) { assertThat(factory.isOpen()).isTrue(); }
            String insert="INSERT INTO "+schema+".inventory_session(shelf_id,status,created_at,updated_at,started_at,completed_at,cancelled_at) VALUES ";
            for(String values:new String[]{
                "(1,'DRAFT',now(),now(),now(),NULL,NULL)",
                "(1,'COMPLETED',now(),now(),now(),NULL,NULL)",
                "(1,'CANCELLED',now(),now(),now(),NULL,NULL)",
                "(1,'IN_PROGRESS',now(),now(),now(),now(),NULL)",
                "(1,'COMPLETED',now(),now(),now(),now(),now())",
                "(1,'COMPLETED',now(),now(),now(),now()-interval '1 hour',NULL)",
                "(1,'CANCELLED',now(),now(),now(),NULL,now()-interval '1 hour')",
                "(1,'IN_PROGRESS',now(),now(),now()-interval '1 hour',NULL,NULL)",
                "(1,'IN_PROGRESS',now(),now()-interval '1 hour',now(),NULL,NULL)",
                "(999,'IN_PROGRESS',now(),now(),now(),NULL,NULL)"}) {
                assertThatThrownBy(() -> jdbc.update(insert+values)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            }
            jdbc.update(insert+"(1,'IN_PROGRESS',now(),now(),now(),NULL,NULL)");
            assertThatThrownBy(() -> jdbc.update(insert+"(1,'IN_PROGRESS',now(),now(),now(),NULL,NULL)")).isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
            jdbc.update("UPDATE "+schema+".inventory_session SET status='COMPLETED',completed_at=now()");
            jdbc.update(insert+"(1,'IN_PROGRESS',now(),now(),now(),NULL,NULL)");
            jdbc.update("DELETE FROM "+schema+".book");
            assertThatThrownBy(() -> jdbc.update("DELETE FROM "+schema+".shelf WHERE id=1")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM "+schema+".inventory_session",Long.class)).isEqualTo(2);
        } finally {
            // This test owns only its isolated schema, never application history.
            for(String table:new String[]{"inventory_session","book","shelf","bookcase","room","flyway_schema_history"}) jdbc.execute("DROP TABLE IF EXISTS "+schema+"."+table);
            jdbc.execute("DROP SCHEMA "+schema);
        }
    }
}

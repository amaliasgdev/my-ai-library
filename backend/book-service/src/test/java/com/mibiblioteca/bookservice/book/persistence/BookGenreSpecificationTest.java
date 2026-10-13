package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import java.util.ArrayList;

@DataJpaTest(properties = "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.mibiblioteca.bookservice.book.persistence.BookGenreSpecificationTest$SqlCapture")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookGenreSpecificationTest {
    @Autowired private BookRepository repository;
    @Autowired private JdbcTemplate jdbc;

    public static class SqlCapture implements StatementInspector {
        static final List<String> queries = new ArrayList<>();
        @Override public String inspect(String sql) { queries.add(sql); return sql; }
    }

    @Test
    void exactCaseInsensitiveArrayMembershipSupportsBoundValuePagingCountAndNoDuplicateRows() {
        assertThat(jdbc.queryForObject("show server_version", String.class)).startsWith("16.");
        assertThat(jdbc.queryForObject("select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'book' and column_name = 'genres'", String.class)).isEqualTo("_varchar");
        repository.deleteAll();
        Book a = save("A", List.of("Terror", "Other", "TERROR"));
        Book b = save("B", List.of("tErRoR"));
        save("C", List.of("Terror psicológico"));
        save("D", List.of());
        save("E", List.of("King's %_ genre"));
        SqlCapture.queries.clear();
        var spec = BookSpecifications.genre("TERROR");
        var first = repository.findAll(spec, PageRequest.of(0, 1, Sort.by("title", "id")));
        var second = repository.findAll(spec, PageRequest.of(1, 1, Sort.by("title", "id")));
        assertThat(first.getContent()).extracting(Book::getId).containsExactly(a.getId());
        assertThat(second.getContent()).extracting(Book::getId).containsExactly(b.getId());
        assertThat(first.getTotalElements()).isEqualTo(2);
        assertThat(second.getTotalElements()).isEqualTo(2);
        assertThat(repository.count(spec)).isEqualTo(2);
        assertThat(repository.findAll(BookSpecifications.genre("TERR"))).isEmpty();
        assertThat(repository.count(BookSpecifications.genre("king's %_ GENRE"))).isEqualTo(1);
        assertThat(repository.count(BookSpecifications.genre("' OR 1=1 --"))).isZero();
        assertThat(SqlCapture.queries).anyMatch(sql -> sql.contains("select count(") && sql.contains("lower(?)"));
        assertThat(SqlCapture.queries).anyMatch(sql -> sql.contains("fetch first") && sql.contains("lower(?)"));
        assertThat(SqlCapture.queries).noneMatch(sql -> sql.contains("TERROR") || sql.contains("OR 1=1"));
    }

    private Book save(String title, List<String> genres) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Author");
        book.setGenres(genres);
        return repository.saveAndFlush(book);
    }
}

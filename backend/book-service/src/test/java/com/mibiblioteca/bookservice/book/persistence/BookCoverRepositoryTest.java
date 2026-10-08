package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookCoverRepositoryTest {
    @Autowired private BookRepository bookRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void shouldPersistReloadReplaceAndClearCover() {
        Book book = book();
        assertThat(book.getCoverUrl()).isNull();
        book.setCoverUrl("https://example.com/cover.jpg");
        bookRepository.saveAndFlush(book);
        Long id = book.getId();
        entityManager.clear();

        Book reloaded = bookRepository.findById(id).orElseThrow();
        assertThat(reloaded.getCoverUrl()).isEqualTo("https://example.com/cover.jpg");
        reloaded.setCoverUrl("https://example.com/new-cover.jpg");
        bookRepository.saveAndFlush(reloaded);
        entityManager.clear();
        reloaded = bookRepository.findById(id).orElseThrow();
        assertThat(reloaded.getCoverUrl()).isEqualTo("https://example.com/new-cover.jpg");

        reloaded.setCoverUrl(null);
        bookRepository.saveAndFlush(reloaded);
        entityManager.clear();
        assertThat(bookRepository.findById(id).orElseThrow().getCoverUrl()).isNull();
    }

    @Test
    void shouldPersistBookWithoutCover() {
        Book book = bookRepository.saveAndFlush(book());
        entityManager.clear();
        assertThat(bookRepository.findById(book.getId()).orElseThrow().getCoverUrl()).isNull();
    }

    @Test
    void shouldPersist2048Characters() {
        Book book = book();
        String prefix = "https://example.com/";
        String url = prefix + "a".repeat(2048 - prefix.length());
        book.setCoverUrl(url);
        bookRepository.saveAndFlush(book);
        entityManager.clear();
        assertThat(bookRepository.findById(book.getId()).orElseThrow().getCoverUrl()).isEqualTo(url);
    }

    @Test
    void shouldReject2049CharactersAtDatabaseLevel() {
        Book book = book();
        String prefix = "https://example.com/";
        book.setCoverUrl(prefix + "a".repeat(2049 - prefix.length()));
        assertThatThrownBy(() -> bookRepository.saveAndFlush(book)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void shouldHaveNullableVarchar2048WithoutDefault() {
        var column = jdbcTemplate.queryForMap("""
            SELECT data_type, character_maximum_length, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'book' AND column_name = 'cover_url'
            """);
        assertThat(column.get("data_type")).isEqualTo("character varying");
        assertThat(column.get("character_maximum_length")).isEqualTo(2048);
        assertThat(column.get("is_nullable")).isEqualTo("YES");
        assertThat(column.get("column_default")).isNull();
    }

    private Book book() {
        Book book = new Book();
        book.setTitle("Clean Code");
        book.setAuthor("Robert C. Martin");
        return book;
    }
}

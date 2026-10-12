package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookMetadataRepositoryTest {
    @Autowired private BookRepository bookRepository;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void shouldPersistReloadReplaceAndClearNativePostgresArray() {
        Book book = book();
        book.setPublisher("Minotauro");
        book.setPublicationYear(2001);
        book.setPageCount(480);
        book.setLanguage("es");
        book.setGenres(List.of("Fantasía", "Aventura", "Clásicos"));
        bookRepository.saveAndFlush(book);
        Long id = book.getId();
        entityManager.clear();

        Book loaded = bookRepository.findById(id).orElseThrow();
        assertThat(loaded.getPublisher()).isEqualTo("Minotauro");
        assertThat(loaded.getPublicationYear()).isEqualTo(2001);
        assertThat(loaded.getPageCount()).isEqualTo(480);
        assertThat(loaded.getLanguage()).isEqualTo("es");
        assertThat(loaded.getGenres()).containsExactly("Fantasía", "Aventura", "Clásicos");
        assertThat(jdbcTemplate.queryForObject("SELECT pg_typeof(genres)::text FROM book WHERE id = ?", String.class, id))
            .isEqualTo("character varying[]");

        loaded.setGenres(List.of("Historia", "Ensayo"));
        bookRepository.saveAndFlush(loaded);
        entityManager.clear();
        loaded = bookRepository.findById(id).orElseThrow();
        assertThat(loaded.getGenres()).containsExactly("Historia", "Ensayo");

        loaded.setGenres(List.of());
        loaded.setPublisher(null);
        loaded.setPublicationYear(null);
        loaded.setPageCount(null);
        loaded.setLanguage(null);
        bookRepository.saveAndFlush(loaded);
        entityManager.clear();
        loaded = bookRepository.findById(id).orElseThrow();
        assertThat(loaded.getGenres()).isEmpty();
        assertThat(loaded.getPublisher()).isNull();
        assertThat(loaded.getPublicationYear()).isNull();
        assertThat(loaded.getPageCount()).isNull();
        assertThat(loaded.getLanguage()).isNull();
    }

    @Test
    void shouldPersistDefaultsAndBoundaryValues() {
        Book book = bookRepository.saveAndFlush(book());
        entityManager.clear();
        Book loaded = bookRepository.findById(book.getId()).orElseThrow();
        assertThat(loaded.getGenres()).isEmpty();
        assertThat(loaded.getPublicationYear()).isNull();
        loaded.setPublisher("a".repeat(255));
        loaded.setPublicationYear(1);
        loaded.setPageCount(Integer.MAX_VALUE);
        loaded.setGenres(java.util.stream.IntStream.range(0, 10).mapToObj(i -> i + "a".repeat(49)).toList());
        bookRepository.saveAndFlush(loaded);
        entityManager.clear();
        loaded = bookRepository.findById(book.getId()).orElseThrow();
        assertThat(loaded.getGenres()).hasSize(10);
        loaded.setPublicationYear(2100);
        bookRepository.saveAndFlush(loaded);
        entityManager.clear();
        assertThat(bookRepository.findById(book.getId()).orElseThrow().getPublicationYear()).isEqualTo(2100);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "publication_year = 0", "publication_year = 2101", "page_count = 0", "page_count = -1",
        "language = 'ES'", "language = 'e'", "language = '12'",
        "genres = array_fill('Fantasy'::varchar, ARRAY[11])", "genres = ARRAY['Fantasy', NULL]::varchar[]",
        "genres = NULL", "genres = ARRAY[repeat('a', 51)]::varchar[]", "publisher = repeat('a', 256)"
    })
    void shouldEnforceDatabaseConstraints(String assignment) {
        Book book = bookRepository.saveAndFlush(book());
        assertThatThrownBy(() -> jdbcTemplate.update("UPDATE book SET " + assignment + " WHERE id = ?", book.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Book book() {
        Book book = new Book();
        book.setTitle("Book metadata test");
        book.setAuthor("Author");
        return book;
    }
}

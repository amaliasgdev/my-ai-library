package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookSearchRepositoryTest {

    @Autowired
    private BookRepository bookRepository;

    @BeforeEach
    void setUp() {
        bookRepository.deleteAll();

        Book b1 = new Book();
        b1.setTitle("Clean Code");
        b1.setAuthor("Robert C. Martin");
        b1.setIsbn("9780132350884");

        Book b2 = new Book();
        b2.setTitle("Domain-Driven Design");
        b2.setAuthor("Eric Evans");
        b2.setIsbn("9780321125217");

        bookRepository.saveAll(List.of(b1, b2));
    }

    @Test
    void shouldSearchByTitleIgnoreCaseContaining() {
        List<Book> result = bookRepository.findByTitleContainingIgnoreCase("clean");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTitle()).isEqualTo("Clean Code");
    }

    @Test
    void shouldSearchByAuthorIgnoreCaseContaining() {
        List<Book> result = bookRepository.findByAuthorContainingIgnoreCase("evans");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAuthor()).isEqualTo("Eric Evans");
    }

    @Test
    void shouldSearchByTitleAndAuthor() {
        List<Book> result = bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase("clean", "martin");
        assertThat(result).hasSize(1);
    }

    @Test
    void shouldSearchByExactIsbn() {
        List<Book> result = bookRepository.findByIsbn("9780321125217");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTitle()).isEqualTo("Domain-Driven Design");
    }
}

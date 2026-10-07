package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookRepositoryTest {

    @Autowired
    private BookRepository bookRepository;

    @BeforeEach
    void setUp() {
        bookRepository.deleteAll();
    }

    @Test
    void existsByIsbnShouldWork() {
        Book book = new Book();
        book.setTitle("Domain-Driven Design");
        book.setAuthor("Eric Evans");
        book.setIsbn("9780321125217");
        bookRepository.save(book);

        boolean exists = bookRepository.existsByIsbn("9780321125217");

        assertThat(exists).isTrue();
    }

    @Test
    void findAllShouldSupportPagingAndSorting() {
        bookRepository.save(book("Zulu"));
        bookRepository.save(book("Alpha"));
        bookRepository.save(book("Bravo"));

        Page<Book> page = bookRepository.findAll(PageRequest.of(1, 1, Sort.by("title").ascending()));

        assertThat(page.getContent()).extracting(Book::getTitle).containsExactly("Bravo");
        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getTotalPages()).isEqualTo(3);
    }

    private Book book(String title) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Author");
        return book;
    }
}

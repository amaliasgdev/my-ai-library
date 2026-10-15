package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

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
        Page<Book> result = bookRepository.findByTitleContainingIgnoreCase("cLeAn", PageRequest.of(0, 20));
        assertThat(result).hasSize(1);
        assertThat(result.getContent().get(0).getTitle()).isEqualTo("Clean Code");
    }

    @Test
    void shouldSearchByAuthorIgnoreCaseContaining() {
        Page<Book> result = bookRepository.findByAuthorContainingIgnoreCase("eVaNs", PageRequest.of(0, 20));
        assertThat(result).hasSize(1);
        assertThat(result.getContent().get(0).getAuthor()).isEqualTo("Eric Evans");
    }

    @Test
    void shouldSearchByTitleAndAuthor() {
        Page<Book> result = bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase("clean", "martin", PageRequest.of(0, 20));
        assertThat(result).hasSize(1);
    }

    @Test
    void shouldSearchByExactIsbn() {
        Page<Book> result = bookRepository.findByIsbn("9780321125217", PageRequest.of(0, 20));
        assertThat(result).hasSize(1);
        assertThat(result.getContent().get(0).getTitle()).isEqualTo("Domain-Driven Design");
    }

    @Test
    void shouldPageAndSortSearchResults() {
        Book b3 = new Book();
        b3.setTitle("Clean Architecture");
        b3.setAuthor("Robert C. Martin");
        bookRepository.save(b3);

        Page<Book> result = bookRepository.findByAuthorContainingIgnoreCase(
            "martin",
            PageRequest.of(1, 1, Sort.by("title").ascending())
        );

        assertThat(result.getContent()).extracting(Book::getTitle).containsExactly("Clean Code");
        assertThat(result.getTotalElements()).isEqualTo(2);
        assertThat(result.getTotalPages()).isEqualTo(2);
    }

    @ParameterizedTest
    @EnumSource(Sort.Direction.class)
    void shouldPageTitleSearchInBothDirections(Sort.Direction direction) {
        saveBook("Clean Architecture", "Robert C. Martin");
        Sort sort = Sort.by(direction, "title").and(Sort.by("id"));
        Page<Book> first = bookRepository.findByTitleContainingIgnoreCase("cLeAn", PageRequest.of(0, 1, sort));
        Page<Book> second = bookRepository.findByTitleContainingIgnoreCase("cLeAn", PageRequest.of(1, 1, sort));

        String firstTitle = direction == Sort.Direction.ASC ? "Clean Architecture" : "Clean Code";
        String secondTitle = direction == Sort.Direction.ASC ? "Clean Code" : "Clean Architecture";
        assertThat(first.getContent()).extracting(Book::getTitle).containsExactly(firstTitle);
        assertThat(second.getContent()).extracting(Book::getTitle).containsExactly(secondTitle);
        assertThat(second.getNumber()).isEqualTo(1);
        assertThat(second.getSize()).isEqualTo(1);
        assertThat(second.getTotalElements()).isEqualTo(2);
        assertThat(second.getTotalPages()).isEqualTo(2);
    }

    @Test
    void shouldCombineTitleAndAuthorWithAndAndCountOnlyMatches() {
        saveBook("Clean Architecture", "Robert C. Martin");
        saveBook("Clean Design", "Eric Evans");
        Page<Book> result = bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase(
            "cLeAn", "mArTiN", PageRequest.of(1, 1, Sort.by("title").and(Sort.by("id")))
        );
        assertThat(result.getContent()).extracting(Book::getTitle).containsExactly("Clean Code");
        assertThat(result.getTotalElements()).isEqualTo(2);
        assertThat(result.getTotalPages()).isEqualTo(2);
    }

    @Test
    void shouldUseIdAscendingToBreakTiesEvenWithDescendingPrimarySort() {
        Book first = saveBook("Same Title", "Same Author");
        Book second = saveBook("Same Title", "Same Author");
        Sort sort = Sort.by(Sort.Direction.DESC, "title").and(Sort.by("id"));
        Page<Book> result = bookRepository.findByTitleContainingIgnoreCase("same", PageRequest.of(1, 1, sort));
        assertThat(first.getId()).isLessThan(second.getId());
        assertThat(result.getContent()).extracting(Book::getId).containsExactly(second.getId());
        assertThat(result.getTotalElements()).isEqualTo(2);
    }

    @Test
    void shouldReturnEmptyPageForAllFiltersWithoutMatches() {
        PageRequest pageable = PageRequest.of(0, 20);
        List<Page<Book>> results = List.of(
            bookRepository.findByTitleContainingIgnoreCase("missing", pageable),
            bookRepository.findByAuthorContainingIgnoreCase("missing", pageable),
            bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase("clean", "evans", pageable),
            bookRepository.findByIsbn("0132350882", pageable)
        );
        for (Page<Book> result : results) {
            assertThat(result.getContent()).isEmpty();
            assertThat(result.getTotalElements()).isZero();
            assertThat(result.getTotalPages()).isZero();
        }
    }

    @Test
    void shouldReturnEmptyOutOfRangePageWithRealTotals() {
        Page<Book> result = bookRepository.findByIsbn("9780132350884", PageRequest.of(1, 20));
        assertThat(result.getContent()).isEmpty();
        assertThat(result.getNumber()).isEqualTo(1);
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getTotalPages()).isEqualTo(1);
    }

    @Test
    void shouldNotMatchIsbnPartiallyOrWithoutNormalization() {
        assertThat(bookRepository.findByIsbn("978013235", PageRequest.of(0, 20))).isEmpty();
        assertThat(bookRepository.findByIsbn("978-0-13-235088-4", PageRequest.of(0, 20))).isEmpty();
    }

    @Test
    void shouldTreatPercentAsLiteralInTitleAndAuthor() {
        Book literal = saveBook("100% Clean", "100% Martin");
        saveBook("100 Clean", "100 Martin");
        PageRequest pageable = PageRequest.of(0, 20);
        assertThat(bookRepository.findByTitleContainingIgnoreCase("%", pageable).getContent())
            .extracting(Book::getId).containsExactly(literal.getId());
        assertThat(bookRepository.findByAuthorContainingIgnoreCase("%", pageable).getContent())
            .extracting(Book::getId).containsExactly(literal.getId());
        assertThat(bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase("%", "%", pageable).getContent())
            .extracting(Book::getId).containsExactly(literal.getId());
    }

    private Book saveBook(String title, String author) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor(author);
        return bookRepository.save(book);
    }
}

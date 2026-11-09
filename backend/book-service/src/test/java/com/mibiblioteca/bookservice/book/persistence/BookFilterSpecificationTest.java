package com.mibiblioteca.bookservice.book.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookFilterRequest;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookFilterSpecificationTest {
    @Autowired private BookRepository repository;
    @BeforeEach void seed() {
        repository.deleteAll();
        save("A", ReadingStatus.READ, 4, 2020, "es", "100%_Press", List.of("Terror"), "9780306406157");
        save("A", ReadingStatus.READING, 5, 2021, "en", "100 Press", List.of("Drama"), null);
        save("B", ReadingStatus.TO_READ, null, null, null, null, List.of(), null);
        save("C", ReadingStatus.ABANDONED, 3, 2019, "es", "Other", List.of("Terror psicológico"), null);
    }
    static Stream<Arguments> individual() {
        return Stream.of(
            Arguments.of(new BookFilterRequest(List.of(ReadingStatus.READ, ReadingStatus.READING), null, null, null, null, null, null), 2L),
            Arguments.of(new BookFilterRequest(List.of(), 4, null, null, null, null, null), 2L),
            Arguments.of(new BookFilterRequest(List.of(), null, 2020, null, null, null, null), 2L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, 2020, null, null, null), 2L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, null, "TERROR", null, null), 1L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, null, null, "ES", null), 2L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, null, null, null, "pReSs"), 2L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, null, null, null, "%"), 1L),
            Arguments.of(new BookFilterRequest(List.of(), null, null, null, null, null, "_"), 1L),
            Arguments.of(BookFilterRequest.EMPTY, 4L)
        );
    }
    @ParameterizedTest @MethodSource("individual")
    void filtersIndividuallyExcludeUnknownAndUseInclusiveBounds(BookFilterRequest filter, long total) {
        assertThat(repository.count(BookSpecifications.filters(filter))).isEqualTo(total);
    }
    @Test void filtersAndSearchCombineWithAndIncludingIsbn() {
        var filter = new BookFilterRequest(List.of(ReadingStatus.READ, ReadingStatus.READING), 4, 2020, 2020, "terror", "ES", "%_");
        var spec = BookSpecifications.filters(filter);
        assertThat(repository.count(spec)).isEqualTo(1);
        assertThat(repository.count(spec.and(BookSpecifications.search("a", "author", null)))).isEqualTo(1);
        assertThat(repository.count(spec.and(BookSpecifications.search(null, null, "9780306406157")))).isEqualTo(1);
        assertThat(repository.count(spec.and(BookSpecifications.search(null, null, "missing")))).isZero();
    }
    @Test void pagesCountAndStableSortDoNotLoseMatches() {
        var spec = BookSpecifications.filters(new BookFilterRequest(List.of(), 4, null, null, null, null, null));
        var sort = Sort.by(Sort.Order.desc("title"), Sort.Order.asc("id"));
        var first = repository.findAll(spec, PageRequest.of(0, 1, sort));
        var second = repository.findAll(spec, PageRequest.of(1, 1, sort));
        assertThat(first.getTotalElements()).isEqualTo(2);
        assertThat(first.getTotalPages()).isEqualTo(2);
        assertThat(first.getContent().getFirst().getId()).isLessThan(second.getContent().getFirst().getId());
        assertThat(repository.findAll(spec, PageRequest.of(9, 1, sort)).getTotalElements()).isEqualTo(2);
    }
    @Test void searchPercentUnderscoreAndBackslashAreLiteral() {
        save("100%_\\A", ReadingStatus.READ, null, null, null, null, List.of(), null);
        for (String text : List.of("%", "_", "\\")) assertThat(repository.count(BookSpecifications.search(text, null, null))).isEqualTo(1);
    }
    private void save(String title, ReadingStatus status, Integer rating, Integer year, String language, String publisher, List<String> genres, String isbn) {
        Book book = new Book(); book.setTitle(title); book.setAuthor("Author"); book.setReadingStatus(status);
        book.setRating(rating); book.setPublicationYear(year); book.setLanguage(language); book.setPublisher(publisher); book.setGenres(genres); book.setIsbn(isbn);
        repository.saveAndFlush(book);
    }
}

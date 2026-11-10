package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {"spring.datasource.hikari.maximum-pool-size=2", "spring.datasource.hikari.minimum-idle=0"})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Transactional
class MetadataDuplicateIntegrationTest {
    @Autowired MetadataDuplicateService service;
    @Autowired BookRepository repository;

    @Test
    void distinguishesExactEquivalentAndPossibleWithoutBlockingAnotherEditionOrWriting() {
        var exact = save("MetadataUniqueTitle", "MetadataUniqueAuthor", "9780132350884");
        var equivalent = save("MetadataUniqueTitle", "MetadataUniqueAuthor", "0132350882");
        var possible = save("MetadataUniqueTitle edition 2", "MetadataUniqueAuthor", null);
        long before = repository.count();
        var result = service.check("978-0-13-235088-4", "metadatauniquetitle", "metadatauniqueauthor");
        assertThat(result.originalIsbn()).isEqualTo("978-0-13-235088-4");
        assertThat(result.validIsbn()).isTrue();
        assertThat(result.matches()).anyMatch(m -> m.id() == exact.getId() && m.kind().equals("EXACT_ISBN"))
            .anyMatch(m -> m.id() == equivalent.getId() && m.kind().equals("EQUIVALENT_ISBN"))
            .anyMatch(m -> m.id() == possible.getId() && m.kind().equals("POSSIBLE_TITLE_AUTHOR"));
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    void boundsPossibleMatchesAndExplicitlyMarksTruncation() {
        for (int i = 0; i < 21; i++) save("MetadataBoundedUnique " + i, "MetadataBoundedAuthor", null);
        var result = service.check(null, "MetadataBoundedUnique", "MetadataBoundedAuthor");
        assertThat(result.matches()).hasSize(20);
        assertThat(result.truncated()).isTrue();
    }

    @Test
    void invalidIsbnDoesNotBecomeExactAndWildcardsAreLiteral() {
        save("Metadata%_literal", "UniqueAuthor", null);
        save("MetadataAAOther", "UniqueAuthor", null);
        var result = service.check("9780132350885", "Metadata%_", "UniqueAuthor");
        assertThat(result.validIsbn()).isFalse();
        assertThat(result.matches()).hasSize(1);
        assertThat(result.matches().getFirst().kind()).isEqualTo("POSSIBLE_TITLE_AUTHOR");
        assertThat(service.check(null, "Title", null).similarityChecked()).isFalse();
    }

    private Book save(String title, String author, String isbn) {
        var book = new Book(); book.setTitle(title); book.setAuthor(author); book.setIsbn(isbn);
        return repository.saveAndFlush(book);
    }
}

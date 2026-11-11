package com.mibiblioteca.bookservice.book.lookup;

import com.mibiblioteca.bookservice.book.lookup.MetadataDtos.*;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Advisory only. A similarity match is never an identity or an edition conflict. */
@Service
public class MetadataDuplicateService {
    private final BookRepository repository;
    private final IsbnEquivalents equivalents;
    private final IsbnNormalizer normalizer;

    public MetadataDuplicateService(BookRepository repository, IsbnEquivalents equivalents, IsbnNormalizer normalizer) {
        this.repository = repository; this.equivalents = equivalents; this.normalizer = normalizer;
    }

    @Transactional(readOnly = true)
    public Duplicates check(String rawIsbn, String title, String author) {
        if (rawIsbn != null && (rawIsbn.length() > 50 || rawIsbn.codePoints().anyMatch(c -> Character.isISOControl(c)
            || Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR))) {
            throw MetadataService.invalid("Invalid ISBN evidence (at most 50 characters)");
        }
        title = MetadataService.textParameter(title, "title");
        author = MetadataService.textParameter(author, "author");
        var ids = equivalents.valid(rawIsbn);
        String normalized = normalizer.normalize(rawIsbn);
        var matches = new ArrayList<Match>();
        boolean truncated = false;
        var page = PageRequest.of(0, 20, Sort.by("id"));
        if (!ids.isEmpty()) {
            var exact = repository.findAll((Specification<Book>) (root, query, cb) -> root.get("isbn").in(ids), page);
            truncated = exact.hasNext();
            for (var book : exact) matches.add(match(book, normalized.equals(book.getIsbn()) ? "EXACT_ISBN" : "EQUIVALENT_ISBN"));
        }
        boolean similarityChecked = title != null && author != null;
        if (similarityChecked) {
            String titlePattern = pattern(title), authorPattern = pattern(author);
            var possible = repository.findAll((Specification<Book>) (root, query, cb) -> cb.and(
                cb.like(cb.lower(root.get("title")), titlePattern, '\\'),
                cb.like(cb.lower(root.get("author")), authorPattern, '\\')), page);
            truncated |= possible.hasNext();
            for (var book : possible) if (matches.stream().noneMatch(m -> m.id() == book.getId())) matches.add(match(book, "POSSIBLE_TITLE_AUTHOR"));
        }
        return new Duplicates(rawIsbn, normalized, !ids.isEmpty(), ids, matches, truncated, similarityChecked);
    }

    private String pattern(String value) { return "%" + value.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"; }
    private Match match(Book book, String kind) { return new Match(book.getId(), book.getTitle(), book.getAuthor(), book.getIsbn(), kind); }
}

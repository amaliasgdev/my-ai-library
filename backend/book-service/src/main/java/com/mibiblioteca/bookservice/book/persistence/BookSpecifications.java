package com.mibiblioteca.bookservice.book.persistence;

import com.mibiblioteca.bookservice.book.dto.BookFilterRequest;
import java.util.Locale;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.springframework.data.jpa.domain.Specification;

public final class BookSpecifications {
    private BookSpecifications() {}

    public static Specification<Book> filters(BookFilterRequest filters) {
        Specification<Book> spec = Specification.unrestricted();
        if (!filters.readingStatus().isEmpty()) {
            spec = spec.and((root, query, cb) -> root.get("readingStatus").in(filters.readingStatus()));
        }
        if (filters.ratingMin() != null) {
            spec = spec.and((root, query, cb) -> cb.ge(root.get("rating"), filters.ratingMin()));
        }
        if (filters.yearFrom() != null) {
            spec = spec.and((root, query, cb) -> cb.ge(root.get("publicationYear"), filters.yearFrom()));
        }
        if (filters.yearTo() != null) {
            spec = spec.and((root, query, cb) -> cb.le(root.get("publicationYear"), filters.yearTo()));
        }
        if (filters.genre() != null) spec = spec.and(genre(filters.genre()));
        if (filters.language() != null) {
            spec = spec.and((root, query, cb) -> cb.equal(cb.lower(root.get("language")), filters.language()));
        }
        if (filters.publisher() != null) spec = spec.and(contains("publisher", filters.publisher()));
        if (filters.room() != null) spec = spec.and(location("room", filters.room()));
        if (filters.bookcase() != null) spec = spec.and(location("bookcase", filters.bookcase()));
        if (filters.shelf() != null) spec = spec.and(location("shelf", filters.shelf()));
        if (filters.shelfId() != null) spec = spec.and((root, query, cb) -> cb.equal(root.get("assignedShelf").get("id"), filters.shelfId()));
        if (filters.bookcaseId() != null) spec = spec.and((root, query, cb) -> cb.equal(root.get("assignedShelf").get("bookcase").get("id"), filters.bookcaseId()));
        if (filters.roomId() != null) spec = spec.and((root, query, cb) -> cb.equal(root.get("assignedShelf").get("bookcase").get("room").get("id"), filters.roomId()));
        return spec;
    }

    public static Specification<Book> search(String title, String author, String isbn) {
        Specification<Book> spec = Specification.unrestricted();
        if (title != null) spec = spec.and(contains("title", title));
        if (author != null) spec = spec.and(contains("author", author));
        if (isbn != null) spec = spec.and((root, query, cb) -> cb.equal(root.get("isbn"), isbn));
        return spec;
    }

    private static Specification<Book> contains(String field, String value) {
        String escaped = value.toLowerCase(Locale.ROOT)
            .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return (root, query, cb) -> cb.like(cb.lower(root.get(field)), "%" + escaped + "%", '\\');
    }

    private static Specification<Book> location(String field, String value) {
        return (root, query, cb) -> {
            var shelf = root.join("assignedShelf", jakarta.persistence.criteria.JoinType.LEFT);
            var bookcase = shelf.join("bookcase", jakarta.persistence.criteria.JoinType.LEFT);
            var room = bookcase.join("room", jakarta.persistence.criteria.JoinType.LEFT);
            jakarta.persistence.criteria.Expression<String> structured = switch (field) {
                case "room" -> room.get("name");
                case "bookcase" -> bookcase.get("name");
                default -> shelf.get("name");
            };
            return cb.equal(cb.lower(cb.coalesce(structured, root.get(field))), cb.lower(((HibernateCriteriaBuilder) cb).value(value)));
        };
    }

    public static Specification<Book> genre(String genre) {
        return (root, query, builder) -> builder.isTrue(
            builder.function("book_genre_matches", Boolean.class, root.get("genres"),
                ((HibernateCriteriaBuilder) builder).value(genre))
        );
    }
}

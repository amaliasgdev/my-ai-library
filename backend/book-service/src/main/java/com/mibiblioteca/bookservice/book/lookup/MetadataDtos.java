package com.mibiblioteca.bookservice.book.lookup;

import java.util.List;
import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;

public final class MetadataDtos {
    private MetadataDtos() { }
    public record Work(String workKey, String title, List<String> authors, String coverUrl,
        Integer firstPublicationYear, Integer editionCount, String matchKind, String matchedEditionTitle) {
        public Work(String key, String title, List<String> authors, String cover, Integer year, Integer count, String matchKind) {
            this(key, title, authors, cover, year, count, matchKind, null);
        }
        public Work(String key, String title, List<String> authors, String cover, Integer year, Integer count) {
            this(key, title, authors, cover, year, count, "UNASSESSED", null);
        }
    }
    public record Works(List<Work> content, boolean truncated, String resolution) {
        public Works(List<Work> content, boolean truncated) { this(content, truncated, null); }
    }
    public record Edition(String editionKey, List<String> isbns, BookLookupResponse metadata) { }
    public record Editions(String workKey, int page, List<Edition> content, boolean hasNext, boolean partial) {
        public Editions(String workKey, int page, List<Edition> content, boolean hasNext) {
            this(workKey, page, content, hasNext, false);
        }
    }
    public record Match(long id, String title, String author, String isbn, String kind) { }
    public record Duplicates(String originalIsbn, String normalizedIsbn, boolean validIsbn,
        List<String> equivalentIsbns, List<Match> matches, boolean truncated, boolean similarityChecked) { }
}

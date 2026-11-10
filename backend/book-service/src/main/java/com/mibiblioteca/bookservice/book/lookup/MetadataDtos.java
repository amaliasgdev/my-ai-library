package com.mibiblioteca.bookservice.book.lookup;

import java.util.List;
import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;

public final class MetadataDtos {
    private MetadataDtos() { }
    public record Work(String workKey, String title, List<String> authors, String coverUrl,
        Integer firstPublicationYear, Integer editionCount) { }
    public record Works(List<Work> content, boolean truncated) { }
    public record Edition(String editionKey, List<String> isbns, BookLookupResponse metadata) { }
    public record Editions(String workKey, int page, List<Edition> content, boolean hasNext) { }
    public record Match(long id, String title, String author, String isbn, String kind) { }
    public record Duplicates(String originalIsbn, String normalizedIsbn, boolean validIsbn,
        List<String> equivalentIsbns, List<Match> matches, boolean truncated, boolean similarityChecked) { }
}

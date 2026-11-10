package com.mibiblioteca.bookservice.book.lookup;

import com.fasterxml.jackson.databind.JsonNode;
import com.mibiblioteca.bookservice.book.lookup.MetadataDtos.*;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MetadataService {
    private final OpenLibraryClient client;
    private final OpenLibraryMapper mapper;
    private final OpenLibraryProperties properties;
    private final IsbnEquivalents isbns;

    public MetadataService(OpenLibraryClient client, OpenLibraryMapper mapper, OpenLibraryProperties properties, IsbnEquivalents isbns) {
        this.client = client; this.mapper = mapper; this.properties = properties; this.isbns = isbns;
    }

    public Works search(String title, String author) {
        title = textParameter(title, "title"); author = textParameter(author, "author");
        if (title == null && author == null) throw invalid("Provide title or author");
        var json = client.metadataSearch(title, author, new LookupBudget(properties.lookupTimeout()));
        JsonNode docs = json.path("docs");
        if (!docs.isArray() || docs.size() > 10) throw upstream();
        var result = new ArrayList<Work>();
        var keys = new HashSet<String>();
        for (var doc : docs) {
            String key = doc.path("key").asText("");
            if (!key.matches("/works/OL[0-9]{1,12}W") || !keys.add(key)) continue;
            String name = optionalText(doc.path("title"));
            if (name == null) continue;
            var authors = new ArrayList<String>();
            if (doc.path("author_name").isArray()) for (var node : doc.path("author_name")) {
                String value = optionalText(node);
                if (value != null && !authors.contains(value) && authors.size() < 10) authors.add(value);
            }
            var cover = doc.path("cover_i");
            String coverUrl = cover.isIntegralNumber() && cover.canConvertToLong() && cover.longValue() > 0
                ? properties.coversBaseUrl().resolve("/b/id/" + cover.longValue() + "-L.jpg?default=false").toString() : null;
            result.add(new Work(key, name, authors, coverUrl, integer(doc.path("first_publish_year"), 2100),
                integer(doc.path("edition_count"), Integer.MAX_VALUE)));
        }
        return new Works(result, json.path("numFound").asLong(docs.size()) > docs.size());
    }

    public Editions editions(String workKey, int page) {
        if (workKey == null || !workKey.matches("/works/OL[0-9]{1,12}W") || page < 0 || page > 9) throw invalid("Invalid work identifier or page (0..9)");
        var json = client.metadataEditions(workKey, page, new LookupBudget(properties.lookupTimeout()));
        var entries = json.path("entries");
        if (!entries.isArray() || entries.size() > 10) throw upstream();
        var result = new ArrayList<Edition>();
        var keys = new HashSet<String>();
        for (var entry : entries) {
            String key = entry.path("key").asText("");
            if (!key.matches("/books/OL[0-9]{1,12}M") || !keys.add(key)) continue;
            // Reject explicitly inconsistent work associations; absent associations remain unknown.
            if (entry.path("works").isArray() && !entry.path("works").isEmpty()) {
                boolean belongs = false;
                for (var work : entry.path("works")) if (workKey.equals(work.path("key").asText())) belongs = true;
                if (!belongs) continue;
            }
            var valid = new ArrayList<String>();
            for (String field : List.of("isbn_13", "isbn_10")) if (entry.path(field).isArray()) {
                for (var node : entry.path(field)) {
                    if (!node.isTextual() || node.textValue().length() > 20) continue;
                    var equivalents = isbns.valid(node.textValue());
                    if (!equivalents.isEmpty() && !valid.contains(equivalents.getFirst()) && valid.size() < 10) valid.add(equivalents.getFirst());
                }
            }
            // ISBN remains null until a human selects a specific identifier; no work-year fallback.
            result.add(new Edition(key, valid, mapper.map(null, entry, null)));
        }
        return new Editions(workKey, page, result, page < 9 && json.path("size").asLong(0) > (page + 1L) * 10);
    }

    static String textParameter(String value, String field) {
        if (value == null) return null;
        if (value.length() > 255 || value.isBlank() || value.codePoints().anyMatch(c -> Character.isISOControl(c)
            || Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR)) {
            throw invalid("Invalid " + field + " (nonblank, single line, at most 255 characters)");
        }
        return value.strip();
    }

    private String optionalText(JsonNode node) {
        if (!node.isTextual()) return null;
        try { return textParameter(node.textValue(), "metadata"); } catch (BookLookupException ex) { return null; }
    }
    private Integer integer(JsonNode node, int max) {
        return node.isIntegralNumber() && node.canConvertToInt() && node.intValue() > 0 && node.intValue() <= max ? node.intValue() : null;
    }
    static BookLookupException invalid(String message) { return new BookLookupException(HttpStatus.BAD_REQUEST, "Invalid metadata request", message); }
    private BookLookupException upstream() { return new BookLookupException(HttpStatus.BAD_GATEWAY, "Invalid book provider response", "External metadata response is incompatible"); }
}

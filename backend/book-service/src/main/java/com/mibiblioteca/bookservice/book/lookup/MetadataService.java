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
        return works(client.metadataSearch(title, author, new LookupBudget(properties.lookupTimeout())));
    }

    public Works search(String title, String author, String language, boolean smart) {
        title = textParameter(title, "title"); author = textParameter(author, "author");
        if (title == null && author == null) throw invalid("Provide title or author");
        language = MetadataSearchStrategy.language(language);
        if (!smart) return works(client.metadataSearch(title, author, language, new LookupBudget(properties.lookupTimeout())));
        var budget = new LookupBudget(properties.lookupTimeout());
        var result = new java.util.LinkedHashMap<String, Work>();
        String originalAuthorForMatch = author;
        boolean truncated = false;
        for (var query : MetadataSearchStrategy.queries(title, author)) {
            var found = works(client.metadataSearch(query.title(), query.author(), language, budget));
            truncated |= found.truncated();
            for (var work : found.content()) {
                boolean exact = MetadataSearchStrategy.normalize(work.title()).equals(MetadataSearchStrategy.normalize(title))
                    && (author == null || work.authors().stream().anyMatch(a -> MetadataSearchStrategy.normalize(a)
                        .equals(MetadataSearchStrategy.normalize(originalAuthorForMatch))));
                result.putIfAbsent(work.workKey(), new Work(work.workKey(), work.title(), work.authors(), work.coverUrl(),
                    work.firstPublicationYear(), work.editionCount(), exact ? "EXACT_TEXT" : "APPROXIMATE"));
            }
            if (result.values().stream().anyMatch(w -> relevance(w, query.title(), originalAuthorForMatch) > 1)) break;
        }
        String originalTitle = title, originalAuthor = author;
        var ranked = result.values().stream().sorted(java.util.Comparator.comparingInt((Work w) ->
            relevance(w, originalTitle, originalAuthor)).reversed()).limit(10).toList();
        return new Works(ranked, truncated || result.size() > 10);
    }

    private int relevance(Work work, String title, String author) {
        String t = MetadataSearchStrategy.normalize(title), a = MetadataSearchStrategy.normalize(author);
        int rank = work.matchKind().equals("EXACT_TEXT") ? 100 : 0;
        for (String word : t.split(" ")) if (!word.isBlank() && MetadataSearchStrategy.normalize(work.title()).contains(word)) rank++;
        if (!a.isBlank() && work.authors().stream().anyMatch(v -> MetadataSearchStrategy.normalize(v).contains(a.substring(a.lastIndexOf(' ') + 1)))) rank += 10;
        return rank;
    }

    private Works works(JsonNode json) {
        JsonNode docs = json.path("docs");
        if (!docs.isArray() || docs.size() > 10) throw upstream();
        var result = new ArrayList<Work>();
        var keys = new HashSet<String>();
        for (var doc : docs) {
            String key = doc.path("key").asText("");
            if (key.matches("OL[0-9]{1,12}W")) key = "/works/" + key;
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
        return new Works(result, json.path("numFound").asLong(json.path("num_found").asLong(docs.size())) > docs.size());
    }

    public Editions filteredEditions(String workKey, String language, String title, String publisher, String year, String isbn) {
        if (workKey == null || !workKey.matches("/works/OL[0-9]{1,12}W")) throw invalid("Invalid work identifier");
        language = MetadataSearchStrategy.language(language);
        title = textParameter(title, "title"); publisher = textParameter(publisher, "publisher");
        year = textParameter(year, "year"); isbn = textParameter(isbn, "isbn");
        StringBuilder query = new StringBuilder();
        if (language != null) {
            String iso3 = java.util.Locale.of(language).getISO3Language();
            // Open Library uses bibliographic aliases for these languages.
            iso3 = switch (iso3) { case "fra" -> "fre"; case "deu" -> "ger"; default -> iso3; };
            query.append("language:").append(iso3);
        }
        String[] fields = {"title", "publisher", "publish_year", "isbn"};
        String[] values = {title, publisher, year, isbn};
        for (int i = 0; i < values.length; i++) {
            String value = textParameter(values[i], fields[i]);
            if (value == null) continue;
            if (fields[i].equals("publish_year") && (!value.matches("[0-9]{1,4}") || Integer.parseInt(value) < 1 || Integer.parseInt(value) > 2100)) throw invalid("Invalid year");
            if (fields[i].equals("isbn") && isbns.valid(value).isEmpty()) throw invalid("Invalid ISBN");
            if (fields[i].equals("isbn")) value = isbns.valid(value).getFirst();
            // Quote literal values; do not allow user-supplied Solr operators.
            query.append(' ').append(fields[i].equals("title") ? "" : fields[i] + ":").append('"')
                .append(value.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        var budget = new LookupBudget(properties.lookupTimeout());
        var json = client.filteredEdition(workKey, query.toString(), language, budget);
        if (!json.path("docs").isArray() || json.path("docs").size() > 1) throw upstream();
        var entries = new ArrayList<JsonNode>();
        for (var doc : json.path("docs")) {
            String key = doc.path("key").asText();
            if (!workKey.equals(key) && !workKey.equals("/works/" + key)) continue;
            if (!doc.path("editions").path("docs").isArray()) throw upstream();
            for (var edition : doc.path("editions").path("docs")) {
                String editionKey = edition.path("key").asText();
                if (editionKey.matches("/books/OL[0-9]{1,12}M")) {
                    var hydrated = client.metadataEdition(editionKey, budget);
                    if (!editionKey.equals(hydrated.path("key").asText())) throw upstream();
                    entries.add(hydrated);
                }
                if (!entries.isEmpty()) break;
            }
            break;
        }
        var wrapper = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        var array = wrapper.putArray("entries"); entries.forEach(array::add);
        var mapped = mapEditions(workKey, 0, wrapper);
        String selectedLanguage = language;
        String selectedTitle = title, selectedPublisher = publisher, selectedYear = year, selectedIsbn = isbn;
        // Search fields may match different editions of a work. Verify the hydrated edition,
        // never substitute the work's first-publication year or assume all index hits are exact.
        var verified = mapped.content().stream().filter(e ->
            (selectedLanguage == null || selectedLanguage.equals(e.metadata().language()))
            && contains(e.metadata().title(), selectedTitle) && contains(e.metadata().publisher(), selectedPublisher)
            && (selectedYear == null || java.util.Objects.equals(e.metadata().publicationYear(), Integer.valueOf(selectedYear)))
            && (selectedIsbn == null || e.isbns().stream().anyMatch(v -> !java.util.Collections.disjoint(isbns.valid(v), isbns.valid(selectedIsbn)))))
            .toList();
        return new Editions(workKey, 0, verified, false, true);
    }

    private boolean contains(String actual, String expected) {
        return expected == null || (actual != null && MetadataSearchStrategy.normalize(actual).contains(MetadataSearchStrategy.normalize(expected)));
    }

    public Editions editions(String workKey, int page) {
        if (workKey == null || !workKey.matches("/works/OL[0-9]{1,12}W") || page < 0 || page > 9) throw invalid("Invalid work identifier or page (0..9)");
        var json = client.metadataEditions(workKey, page, new LookupBudget(properties.lookupTimeout()));
        return mapEditions(workKey, page, json);
    }

    private Editions mapEditions(String workKey, int page, JsonNode json) {
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

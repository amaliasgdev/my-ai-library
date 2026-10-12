package com.mibiblioteca.bookservice.book.lookup;

import com.fasterxml.jackson.databind.JsonNode;
import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;
import com.mibiblioteca.bookservice.book.validation.HttpUrlValidator;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class OpenLibraryMapper {
    private final OpenLibraryProperties properties;
    private final HttpUrlValidator urlValidator = new HttpUrlValidator();
    private final Set<String> languages = Set.of(Locale.getISOLanguages());
    private final Map<String, String> threeLetterLanguages = new HashMap<>();

    public OpenLibraryMapper(OpenLibraryProperties properties) {
        this.properties = properties;
        for (String language : languages) {
            String iso3 = Locale.forLanguageTag(language).getISO3Language();
            // Java may include historical aliases; prefer their canonical language tag.
            String canonical = Locale.forLanguageTag(language).getLanguage();
            threeLetterLanguages.put(iso3, canonical);
        }
        threeLetterLanguages.putAll(Map.ofEntries(
            Map.entry("fre", "fr"), Map.entry("ger", "de"), Map.entry("dut", "nl"), Map.entry("cze", "cs"),
            Map.entry("gre", "el"), Map.entry("rum", "ro"), Map.entry("slo", "sk"), Map.entry("wel", "cy"),
            Map.entry("alb", "sq"), Map.entry("arm", "hy"), Map.entry("baq", "eu"), Map.entry("bur", "my"),
            Map.entry("chi", "zh"), Map.entry("geo", "ka"), Map.entry("ice", "is"), Map.entry("mac", "mk"),
            Map.entry("mao", "mi"), Map.entry("may", "ms"), Map.entry("per", "fa"), Map.entry("tib", "bo")
        ));
    }

    public BookLookupResponse map(String isbn, JsonNode edition, JsonNode enrichment) {
        String author = authors(edition.path("authors"));
        List<String> genres = genres(edition.path("subjects"));
        JsonNode work = matchingWork(edition, enrichment);
        if (work != null) {
            if (author == null) { author = authors(work.path("author_name")); }
            if (genres.isEmpty()) { genres = genres(work.path("subject")); }
        }
        JsonNode pages = edition.path("number_of_pages");
        Integer pageCount = pages.isIntegralNumber() && pages.canConvertToInt() && pages.intValue() > 0 ? pages.intValue() : null;
        return new BookLookupResponse(isbn, text(edition.path("title"), 255), author,
            firstText(edition.path("publishers"), 255), year(edition.path("publish_date")), pageCount,
            language(edition.path("languages")), genres, cover(edition));
    }

    public boolean needsEnrichment(JsonNode edition) {
        return (authors(edition.path("authors")) == null || genres(edition.path("subjects")).isEmpty())
            && !workKeys(edition).isEmpty();
    }

    private JsonNode matchingWork(JsonNode edition, JsonNode enrichment) {
        if (enrichment == null || !enrichment.path("docs").isArray()) { return null; }
        Set<String> keys = workKeys(edition);
        for (JsonNode doc : enrichment.path("docs")) {
            String key = text(doc.path("key"), 100);
            if (key != null && keys.contains(key.startsWith("/") ? key : "/works/" + key)) { return doc; }
        }
        return null;
    }

    private Set<String> workKeys(JsonNode edition) {
        Set<String> keys = new HashSet<>();
        if (edition.path("works").isArray()) {
            for (JsonNode work : edition.path("works")) {
                String key = text(work.path("key"), 100);
                if (key != null && key.matches("/works/OL[0-9]+W")) { keys.add(key); }
            }
        }
        return keys;
    }

    private String text(JsonNode node, int max) {
        if (!node.isTextual()) { return null; }
        String value = node.textValue().trim();
        return value.isBlank() || value.length() > max ? null : value;
    }

    private String name(JsonNode node, int max) {
        return text(node.isObject() ? node.path("name") : node, max);
    }

    private String firstText(JsonNode nodes, int max) {
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                String value = name(node, max);
                if (value != null) { return value; }
            }
        }
        return null;
    }

    private String authors(JsonNode nodes) {
        if (!nodes.isArray()) { return null; }
        Set<String> seen = new HashSet<>();
        StringBuilder result = new StringBuilder();
        for (JsonNode node : nodes) {
            String name = name(node, 255);
            if (name == null || !seen.add(name.toLowerCase(Locale.ROOT))) { continue; }
            int separator = result.isEmpty() ? 0 : 2;
            if (result.length() + separator + name.length() <= 255) {
                if (separator > 0) { result.append("; "); }
                result.append(name);
            }
        }
        return result.isEmpty() ? null : result.toString();
    }

    private List<String> genres(JsonNode nodes) {
        List<String> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                String value = name(node, 50);
                if (value != null && seen.add(value.toLowerCase(Locale.ROOT))) {
                    result.add(value);
                    if (result.size() == 10) { break; }
                }
            }
        }
        return result;
    }

    private String language(JsonNode nodes) {
        if (!nodes.isArray() || nodes.isEmpty()) { return null; }
        Set<String> mapped = new HashSet<>();
        for (JsonNode node : nodes) {
            String code = node.isTextual() ? node.textValue() : text(node.path("key"), 100);
            if (code == null) { return null; }
            code = code.toLowerCase(Locale.ROOT);
            if (code.startsWith("/languages/")) { code = code.substring("/languages/".length()); }
            String result = languages.contains(code) ? code : threeLetterLanguages.get(code);
            if (result == null || !languages.contains(result)) { return null; }
            mapped.add(result);
        }
        return mapped.size() == 1 ? mapped.iterator().next() : null;
    }

    private Integer year(JsonNode node) {
        String value = text(node, 100);
        if (value == null) { return null; }
        Integer result = null;
        if (value.matches("[0-9]{1,4}")) { result = Integer.valueOf(value); }
        else {
            List<DateTimeFormatter> formats = List.of(DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("MMMM d, uuuu", Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT),
                DateTimeFormatter.ofPattern("MMM d, uuuu", Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT),
                DateTimeFormatter.ofPattern("d MMMM uuuu", Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT));
            for (DateTimeFormatter format : formats) {
                try { result = LocalDate.parse(value, format).getYear(); break; }
                catch (DateTimeParseException ignored) { }
            }
            if (result == null) {
                try { result = YearMonth.parse(value).getYear(); }
                catch (DateTimeParseException ignored) { }
            }
        }
        return result != null && result >= 1 && result <= 2100 ? result : null;
    }

    private String cover(JsonNode edition) {
        if (edition.path("covers").isArray()) {
            for (JsonNode id : edition.path("covers")) {
                if (id.isIntegralNumber() && id.canConvertToLong() && id.longValue() > 0) {
                    String url = properties.coversBaseUrl().resolve("/b/id/" + id.longValue() + "-L.jpg?default=false").toString();
                    return url.length() <= 2048 && urlValidator.isValid(url, null) ? url : null;
                }
            }
        }
        for (JsonNode candidate : List.of(edition.path("cover_url"), edition.path("cover").path("large"),
            edition.path("cover").path("medium"), edition.path("cover").path("small"))) {
            if (candidate.isTextual() && candidate.textValue().length() <= 2048
                && urlValidator.isValid(candidate.textValue(), null)) { return candidate.textValue(); }
        }
        return null;
    }
}

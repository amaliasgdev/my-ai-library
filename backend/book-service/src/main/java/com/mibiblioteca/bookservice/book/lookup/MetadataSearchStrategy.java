package com.mibiblioteca.bookservice.book.lookup;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Query-only normalization: never modifies observations or confirmed bibliographic data. */
final class MetadataSearchStrategy {
    record Query(String title, String author) { }

    static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT)
            .replaceAll("[\\p{P}\\p{Z}\\s]+", " ").strip();
    }

    static List<Query> queries(String title, String author) {
        var result = new ArrayList<Query>();
        result.add(new Query(title, author));
        String t = normalize(title), a = normalize(author);
        if (!t.isEmpty() || !a.isEmpty()) result.add(new Query(t.isEmpty() ? null : t, a.isEmpty() ? null : a));
        if (!t.isEmpty() && !a.isEmpty()) {
            result.add(new Query(t, a.substring(a.lastIndexOf(' ') + 1)));
        }
        if (!t.isEmpty()) {
            // A literal leading phrase is a broad alternative, not an invented translation.
            String[] words = t.split(" ");
            result.add(new Query(words.length > 3 ? words[0] + " " + words[1] : t, null));
        } else if (!a.isEmpty()) {
            result.add(new Query(null, a.substring(a.lastIndexOf(' ') + 1)));
        }
        return result.stream().distinct().limit(4).toList();
    }

    static String language(String value) {
        if (value == null || value.equals("all")) return null;
        if (!List.of(Locale.getISOLanguages()).contains(value)) throw MetadataService.invalid("Invalid language preference");
        return value;
    }
}

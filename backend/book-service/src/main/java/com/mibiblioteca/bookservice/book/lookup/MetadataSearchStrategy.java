package com.mibiblioteca.bookservice.book.lookup;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

/** Query-only normalization: never modifies observations or confirmed bibliographic data. */
final class MetadataSearchStrategy {
    record Query(String title, String author) { }

    static String normalize(String value) {
        if (value == null) return "";
        String plain = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return plain.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    /** Whole normalized title equality; the only evidence that counts as an exact title match. */
    static boolean sameTitle(String candidate, String query) {
        String normalized = normalize(candidate);
        return !normalized.isEmpty() && normalized.equals(normalize(query));
    }

    /** Dice coefficient over whole normalized tokens; an ordering heuristic, never a probability. */
    static double similarity(String query, String candidate) {
        var queryTokens = new HashSet<>(List.of(normalize(query).split(" ")));
        var candidateTokens = new HashSet<>(List.of(normalize(candidate).split(" ")));
        queryTokens.remove("");
        candidateTokens.remove("");
        if (queryTokens.isEmpty() || candidateTokens.isEmpty()) return 0;
        var common = new HashSet<>(queryTokens);
        common.retainAll(candidateTokens);
        double coverage = (double) common.size() / queryTokens.size();
        double precision = (double) common.size() / candidateTokens.size();
        return coverage + precision == 0 ? 0 : 2 * coverage * precision / (coverage + precision);
    }

    /** Compatible when any bibliographic author shares the recognized author's final name token. */
    static boolean sameAuthor(List<String> authors, String queryAuthor) {
        String query = normalize(queryAuthor);
        if (query.isEmpty()) return false;
        String surname = query.substring(query.lastIndexOf(' ') + 1);
        return authors.stream().map(MetadataSearchStrategy::normalize).anyMatch(a -> !a.isEmpty()
            && a.substring(a.lastIndexOf(' ') + 1).equals(surname));
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

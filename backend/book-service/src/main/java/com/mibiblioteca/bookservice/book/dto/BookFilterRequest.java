package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.validation.IsoLanguageValidator;
import com.mibiblioteca.bookservice.common.exception.InvalidBookFilterException;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.springframework.util.MultiValueMap;

/** Validated catalog filters; raw query parsing deliberately checks cardinality before conversion. */
public record BookFilterRequest(
    List<ReadingStatus> readingStatus,
    Integer ratingMin,
    Integer yearFrom,
    Integer yearTo,
    List<String> genres,
    boolean genreUnassigned,
    String language,
    String publisher
) {
    public static final BookFilterRequest EMPTY = new BookFilterRequest(List.of(), null, null, null, List.of(), false, null, null);

    public BookFilterRequest {
        readingStatus = readingStatus == null ? List.of() : List.copyOf(readingStatus);
        if (readingStatus.size() > 4) fail("readingStatus", "At most four states are allowed");
        readingStatus = readingStatus.stream().distinct().sorted().toList();
        genres = normalizeGenres(genres);
        range("ratingMin", ratingMin, 5);
        range("yearFrom", yearFrom, 2100);
        range("yearTo", yearTo, 2100);
        if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
            fail("yearTo", "Must not be earlier than yearFrom");
        }
        publisher = text("publisher", publisher, 255);
        language = text("language", language, 2);
        if (!new IsoLanguageValidator().isValid(language, null)) {
            fail("language", "Must be a recognized ISO 639-1 code");
        }
        if (language != null) language = language.toLowerCase(Locale.ROOT);
    }

    public static BookFilterRequest fromQuery(MultiValueMap<String, String> params) {
        for (String key : List.of("page", "size", "sortBy", "direction", "title", "author", "isbn")) {
            single(params, key);
        }
        List<String> raw = params.getOrDefault("readingStatus", List.of());
        if (raw.size() > 4) fail("readingStatus", "At most four occurrences are allowed");
        List<ReadingStatus> states = raw.stream().map(BookFilterRequest::state).toList();
        List<String> rawGenres = params.getOrDefault("genre", List.of());
        if (rawGenres.size() > 50) fail("genre", "At most 50 occurrences are allowed");
        boolean genreUnassigned = booleanValue(single(params, "genreUnassigned"));
        return new BookFilterRequest(states, integer(params, "ratingMin"), integer(params, "yearFrom"),
            integer(params, "yearTo"), rawGenres, genreUnassigned, single(params, "language"), single(params, "publisher"));
    }

    private static List<String> normalizeGenres(List<String> values) {
        if (values == null || values.isEmpty()) return List.of();
        if (values.size() > 50) fail("genre", "At most 50 occurrences are allowed");
        var unique = new LinkedHashSet<String>();
        var keys = new HashSet<String>();
        for (String value : values) {
            if (value == null) fail("genre", "Must be nonblank and at most 50 characters");
            String normalized = text("genre", value, 50);
            String key = normalized.toLowerCase(Locale.ROOT);
            if (keys.add(key)) unique.add(normalized);
        }
        return List.copyOf(unique);
    }

    private static boolean booleanValue(String value) {
        if (value == null) return false;
        if ("true".equals(value)) return true;
        if ("false".equals(value)) return false;
        fail("genreUnassigned", "Must be true or false");
        return false;
    }

    private static ReadingStatus state(String value) {
        try {
            return ReadingStatus.valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw new InvalidBookFilterException("readingStatus", "Invalid reading state");
        }
    }

    private static String single(MultiValueMap<String, String> params, String key) {
        if (!params.containsKey(key)) return null;
        if (params.get(key).size() != 1) fail(key, "Must occur exactly once");
        return params.getFirst(key);
    }

    private static Integer integer(MultiValueMap<String, String> params, String key) {
        String raw = single(params, key);
        if (raw == null) return null;
        try {
            if (!raw.matches("[0-9]+")) fail(key, "Must be an integer");
            return Integer.valueOf(raw);
        } catch (NumberFormatException ex) {
            throw new InvalidBookFilterException(key, "Must be an integer");
        }
    }

    private static void range(String key, Integer value, int max) {
        if (value != null && (value < 1 || value > max)) fail(key, "Must be between 1 and " + max);
    }

    private static String text(String key, String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isEmpty() || trimmed.length() > max) {
            fail(key, "Must be nonblank and at most " + max + " characters");
        }
        return trimmed;
    }
    private static void fail(String key, String message) {
        throw new InvalidBookFilterException(key, message);
    }
}

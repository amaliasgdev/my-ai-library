package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.validation.IsoLanguageValidator;
import com.mibiblioteca.bookservice.common.exception.InvalidBookFilterException;
import java.util.List;
import java.util.Locale;
import org.springframework.util.MultiValueMap;

/** Validated catalog filters; raw query parsing deliberately checks cardinality before conversion. */
public record BookFilterRequest(
    List<ReadingStatus> readingStatus,
    Integer ratingMin,
    Integer yearFrom,
    Integer yearTo,
    String genre,
    String language,
    String publisher
) {
    public static final BookFilterRequest EMPTY = new BookFilterRequest(List.of(), null, null, null, null, null, null);

    public BookFilterRequest {
        readingStatus = readingStatus == null ? List.of() : List.copyOf(readingStatus);
        if (readingStatus.size() > 4) fail("readingStatus", "At most four states are allowed");
        readingStatus = readingStatus.stream().distinct().sorted().toList();
        range("ratingMin", ratingMin, 5);
        range("yearFrom", yearFrom, 2100);
        range("yearTo", yearTo, 2100);
        if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
            fail("yearTo", "Must not be earlier than yearFrom");
        }
        genre = text("genre", genre, 50);
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
        return new BookFilterRequest(states, integer(params, "ratingMin"), integer(params, "yearFrom"),
            integer(params, "yearTo"), single(params, "genre"), single(params, "language"), single(params, "publisher"));
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

package com.mibiblioteca.bookservice.readinglist;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.util.MultiValueMap;

/** Raw query validation, before any repository access or comma-list conversion. */
final class ReadingListParameters {
    private ReadingListParameters() { }

    static ReadingStatus status(MultiValueMap<String, String> parameters) {
        if (!parameters.containsKey("readingStatus")) return null;
        String value = single(parameters, "readingStatus");
        try { return ReadingStatus.valueOf(value); }
        catch (IllegalArgumentException exception) { throw ReadingListException.invalid("readingStatus"); }
    }

    static List<Long> bookIds(MultiValueMap<String, String> parameters) {
        var values = parameters.get("bookId");
        if (values == null || values.isEmpty()) throw ReadingListException.invalid("bookId");
        var ids = new LinkedHashSet<Long>();
        for (String value : values) {
            ids.add(id(value, "bookId"));
            if (ids.size() > 100) throw ReadingListException.invalid("bookId");
        }
        return List.copyOf(ids);
    }

    static String single(MultiValueMap<String, String> parameters, String field) {
        var values = parameters.get(field);
        if (values == null || values.size() != 1 || values.getFirst() == null || values.getFirst().isEmpty())
            throw ReadingListException.invalid(field);
        return values.getFirst();
    }

    static long id(String value, String field) {
        if (value == null || !value.matches("[0-9]+")) throw ReadingListException.invalid(field);
        try {
            long id = Long.parseLong(value);
            if (id < 1 || id > 9007199254740991L) throw ReadingListException.invalid(field);
            return id;
        } catch (NumberFormatException exception) { throw ReadingListException.invalid(field); }
    }

    static long revision(String value) {
        if (value == null || !value.matches("0|[1-9][0-9]{0,18}")) throw ReadingListException.invalid("expectedRevision");
        try { return Long.parseLong(value); }
        catch (NumberFormatException exception) { throw ReadingListException.invalid("expectedRevision"); }
    }
}

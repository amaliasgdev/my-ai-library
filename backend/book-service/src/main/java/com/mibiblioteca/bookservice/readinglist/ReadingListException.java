package com.mibiblioteca.bookservice.readinglist;

import org.springframework.http.HttpStatus;

public class ReadingListException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public ReadingListException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public String field() { return field; }

    public static ReadingListException invalid(String field) {
        return new ReadingListException(HttpStatus.BAD_REQUEST, "READING_LIST_INVALID_REQUEST", "Invalid " + field, field);
    }

    public static ReadingListException duplicate() {
        return new ReadingListException(HttpStatus.CONFLICT, "READING_LIST_ALREADY_CONTAINS_BOOK",
            "The book is already in the reading list", "bookId");
    }
}

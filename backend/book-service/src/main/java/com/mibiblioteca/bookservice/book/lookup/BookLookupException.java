package com.mibiblioteca.bookservice.book.lookup;

import org.springframework.http.HttpStatus;

public class BookLookupException extends RuntimeException {
    private final HttpStatus status;
    private final String title;
    private final String retryAfter;

    public BookLookupException(HttpStatus status, String title, String detail) {
        this(status, title, detail, null);
    }

    public BookLookupException(HttpStatus status, String title, String detail, String retryAfter) {
        super(detail);
        this.status = status;
        this.title = title;
        this.retryAfter = retryAfter;
    }

    public HttpStatus status() { return status; }
    public String title() { return title; }
    public String retryAfter() { return retryAfter; }
}

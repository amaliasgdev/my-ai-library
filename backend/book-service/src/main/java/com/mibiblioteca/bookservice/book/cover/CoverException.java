package com.mibiblioteca.bookservice.book.cover;

import org.springframework.http.HttpStatus;

public class CoverException extends RuntimeException {
    private final HttpStatus status;
    private final String field;

    public CoverException(HttpStatus status, String detail, String field) {
        super(detail);
        this.status = status;
        this.field = field;
    }

    public HttpStatus status() { return status; }
    public String field() { return field; }

    public static CoverException storage() {
        return new CoverException(HttpStatus.INTERNAL_SERVER_ERROR, "Cover storage operation failed", null);
    }

    public static CoverException notFound() {
        return new CoverException(HttpStatus.NOT_FOUND, "Cover not found", null);
    }
}

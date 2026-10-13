package com.mibiblioteca.bookservice.common.exception;

public class InvalidBookFilterException extends RuntimeException {
    private final String field;

    public InvalidBookFilterException(String field, String message) {
        super(message);
        this.field = field;
    }
    public String field() {
        return field;
    }
}

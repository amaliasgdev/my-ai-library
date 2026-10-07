package com.mibiblioteca.bookservice.common.exception;

public class InvalidReadingTransitionException extends RuntimeException {
    public InvalidReadingTransitionException(String message) {
        super(message);
    }
}

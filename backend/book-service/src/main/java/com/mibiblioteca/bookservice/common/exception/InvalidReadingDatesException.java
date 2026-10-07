package com.mibiblioteca.bookservice.common.exception;

public class InvalidReadingDatesException extends RuntimeException {
    public InvalidReadingDatesException(String message) {
        super(message);
    }
}

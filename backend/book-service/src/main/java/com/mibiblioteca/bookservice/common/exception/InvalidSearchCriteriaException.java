package com.mibiblioteca.bookservice.common.exception;

public class InvalidSearchCriteriaException extends RuntimeException {
    public InvalidSearchCriteriaException(String message) {
        super(message);
    }
}

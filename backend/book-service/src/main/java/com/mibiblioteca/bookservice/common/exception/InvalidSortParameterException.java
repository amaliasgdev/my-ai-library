package com.mibiblioteca.bookservice.common.exception;

public class InvalidSortParameterException extends RuntimeException {
    public InvalidSortParameterException(String sortBy) {
        super("Unsupported sortBy value: " + sortBy);
    }
}

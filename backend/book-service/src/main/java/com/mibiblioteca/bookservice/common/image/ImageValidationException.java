package com.mibiblioteca.bookservice.common.image;

import org.springframework.http.HttpStatus;

public class ImageValidationException extends RuntimeException {
    private final HttpStatus status;

    public ImageValidationException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() { return status; }
}

package com.mibiblioteca.bookservice.book.photoimport;

import org.springframework.http.HttpStatus;

public class PhotoImportException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public PhotoImportException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public String field() { return field; }

    static PhotoImportException invalid(String message, String field) {
        return new PhotoImportException(HttpStatus.BAD_REQUEST, "PHOTO_INVALID", message, field);
    }

    static PhotoImportException timeout() {
        return new PhotoImportException(HttpStatus.GATEWAY_TIMEOUT, "PHOTO_TIMEOUT", "Photo analysis timed out; no automatic retry was performed", null);
    }

    static PhotoImportException invalidResult() {
        return new PhotoImportException(HttpStatus.BAD_GATEWAY, "PHOTO_INVALID_RESULT", "Recognition returned an incompatible result", null);
    }
}

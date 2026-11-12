package com.mibiblioteca.bookservice.saga;

import org.springframework.http.HttpStatus;

public class SagaException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public SagaException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public String field() {
        return field;
    }

    public static SagaException notFound() {
        return new SagaException(HttpStatus.NOT_FOUND, "SAGA_NOT_FOUND", "The saga does not exist", "id");
    }

    public static SagaException duplicate() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_NAME_CONFLICT",
            "A saga with the same name and author already exists", "name");
    }

    public static SagaException revisionConflict() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_REVISION_CONFLICT",
            "The saga changed; reload before writing", "expectedRevision");
    }

    public static SagaException invalidRevision() {
        return new SagaException(HttpStatus.BAD_REQUEST, "SAGA_INVALID_REQUEST",
            "Invalid expectedRevision", "expectedRevision");
    }

    public static SagaException revisionExhausted() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_REVISION_EXHAUSTED",
            "The saga revision cannot be incremented", null);
    }
}

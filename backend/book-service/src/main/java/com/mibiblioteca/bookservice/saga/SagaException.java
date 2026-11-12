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

    public static SagaException volumeNotFound() {
        return new SagaException(HttpStatus.NOT_FOUND, "SAGA_VOLUME_NOT_FOUND",
            "The volume does not exist in this saga", "volumeId");
    }

    public static SagaException bookNotFound() {
        return new SagaException(HttpStatus.NOT_FOUND, "SAGA_BOOK_NOT_FOUND",
            "The book does not exist", "bookId");
    }

    public static SagaException targetRequired() {
        return new SagaException(HttpStatus.BAD_REQUEST, "SAGA_VOLUME_TARGET_REQUIRED",
            "Either bookId or pendingTitle is required", "pendingTitle");
    }

    public static SagaException targetConflict() {
        return new SagaException(HttpStatus.BAD_REQUEST, "SAGA_VOLUME_TARGET_CONFLICT",
            "bookId and pendingTitle are mutually exclusive", "pendingTitle");
    }

    public static SagaException duplicateBook() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_VOLUME_ALREADY_CONTAINS_BOOK",
            "The book is already a volume of this saga", "bookId");
    }

    public static SagaException alreadyLinked() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_VOLUME_ALREADY_LINKED",
            "The volume is already linked to a book", "volumeId");
    }

    public static SagaException notLinked() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_VOLUME_NOT_LINKED",
            "The volume is not linked to a book", "volumeId");
    }

    public static SagaException invalidPosition() {
        return new SagaException(HttpStatus.BAD_REQUEST, "SAGA_VOLUME_INVALID_POSITION",
            "toPosition must be between 1 and the current volume count", "toPosition");
    }

    public static SagaException positionConflict() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_VOLUME_POSITION_CONFLICT",
            "The volume position changed; reload before writing", null);
    }

    public static SagaException capacityExceeded() {
        return new SagaException(HttpStatus.CONFLICT, "SAGA_VOLUME_CAPACITY_EXCEEDED",
            "The saga cannot hold more volumes", null);
    }
}

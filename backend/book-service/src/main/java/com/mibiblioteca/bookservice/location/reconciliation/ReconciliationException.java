package com.mibiblioteca.bookservice.location.reconciliation;

import org.springframework.http.HttpStatus;

public class ReconciliationException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public ReconciliationException(HttpStatus status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    public static ReconciliationException invalid() {
        return new ReconciliationException(HttpStatus.BAD_REQUEST, "INVALID_RECONCILIATION", "Invalid reconciliation request or review token");
    }
    public static ReconciliationException stale() {
        return new ReconciliationException(HttpStatus.CONFLICT, "RECONCILIATION_STALE", "The group changed. Reload and review it again");
    }
    public static ReconciliationException missing() {
        return new ReconciliationException(HttpStatus.NOT_FOUND, "RECONCILIATION_NOT_FOUND", "Legacy group or destination does not exist");
    }
}

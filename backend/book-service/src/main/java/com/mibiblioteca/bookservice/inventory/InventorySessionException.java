package com.mibiblioteca.bookservice.inventory;

import org.springframework.http.HttpStatus;

public class InventorySessionException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public InventorySessionException(HttpStatus status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    public static InventorySessionException missing() { return new InventorySessionException(HttpStatus.NOT_FOUND, "INVENTORY_SESSION_NOT_FOUND", "Shelf or inventory session does not exist"); }
    public static InventorySessionException active() { return new InventorySessionException(HttpStatus.CONFLICT, "INVENTORY_SESSION_ALREADY_ACTIVE", "This shelf already has an active inventory session"); }
    public static InventorySessionException transition() { return new InventorySessionException(HttpStatus.CONFLICT, "INVENTORY_SESSION_INVALID_TRANSITION", "The session is closed and cannot be reopened or closed again"); }
    public static InventorySessionException closed() { return new InventorySessionException(HttpStatus.CONFLICT, "INVENTORY_SESSION_CLOSED", "Notes of a closed session cannot be edited"); }
    public static InventorySessionException conflict() { return new InventorySessionException(HttpStatus.CONFLICT, "INVENTORY_SESSION_CONFLICT", "Concurrent inventory change. Refresh before trying again"); }
}

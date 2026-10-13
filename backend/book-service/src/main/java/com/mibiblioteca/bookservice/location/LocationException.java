package com.mibiblioteca.bookservice.location;

import org.springframework.http.HttpStatus;

public class LocationException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;
    public LocationException(HttpStatus status, String code, String message, String field) {
        super(message); this.status = status; this.code = code; this.field = field;
    }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    public String field() { return field; }
    public static LocationException missing(String field) {
        return new LocationException(HttpStatus.NOT_FOUND, "LOCATION_NOT_FOUND", "Location does not exist", field);
    }
    public static LocationException invalid(String field) {
        return new LocationException(HttpStatus.BAD_REQUEST, "INVALID_LOCATION", "Invalid location", field);
    }
    public static LocationException inUse() {
        return new LocationException(HttpStatus.CONFLICT, "LOCATION_IN_USE", "Location is in use", null);
    }
}

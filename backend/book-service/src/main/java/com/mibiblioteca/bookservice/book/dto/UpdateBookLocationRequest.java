package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

/** Null clears both the structured and legacy representation. */
public record UpdateBookLocationRequest(@Min(1) @Max(9007199254740991L) Long shelfId) {
    @com.fasterxml.jackson.annotation.JsonCreator(mode = com.fasterxml.jackson.annotation.JsonCreator.Mode.DELEGATING)
    public static UpdateBookLocationRequest fromJson(com.fasterxml.jackson.databind.JsonNode node) {
        if (!node.isObject() || node.size() != 1 || !node.has("shelfId")) throw com.mibiblioteca.bookservice.location.LocationException.invalid("location.shelfId");
        var id = node.get("shelfId");
        if (id.isNull()) return new UpdateBookLocationRequest(null);
        if (!id.isIntegralNumber() || !id.canConvertToLong()) throw com.mibiblioteca.bookservice.location.LocationException.invalid("location.shelfId");
        return new UpdateBookLocationRequest(id.longValue());
    }
}

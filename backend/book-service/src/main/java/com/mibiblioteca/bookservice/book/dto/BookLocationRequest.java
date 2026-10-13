package com.mibiblioteca.bookservice.book.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mibiblioteca.bookservice.location.LocationException;
import com.mibiblioteca.bookservice.book.validation.LocationLabel;
import jakarta.validation.constraints.*;
import java.util.Set;

@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record BookLocationRequest(
    @NotNull Kind kind,
    @Min(1) @Max(9007199254740991L) Long shelfId,
    @Size(max = 100) @LocationLabel String room,
    @Size(max = 100) @LocationLabel String bookcase,
    @Size(max = 50) @LocationLabel String shelf
) {
    public enum Kind { SHELF, LEGACY }
    public static BookLocationRequest fromJson(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isObject() || !node.path("kind").isTextual()) throw LocationException.invalid("location");
        Kind kind;
        try { kind = Kind.valueOf(node.path("kind").textValue()); }
        catch (IllegalArgumentException ex) { throw LocationException.invalid("location.kind"); }
        Set<String> allowed = kind == Kind.SHELF ? Set.of("kind", "shelfId") : Set.of("kind", "room", "bookcase", "shelf");
        node.fieldNames().forEachRemaining(key -> { if (!allowed.contains(key)) throw LocationException.invalid("location"); });
        Long id = null;
        if (kind == Kind.SHELF) {
            JsonNode value = node.path("shelfId");
            if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 1 || value.longValue() > 9007199254740991L) throw LocationException.invalid("location.shelfId");
            id = value.longValue();
        }
        return new BookLocationRequest(kind, id, text(node.get("room")), text(node.get("bookcase")), text(node.get("shelf")));
    }
    public static String text(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isTextual()) throw LocationException.invalid("location");
        return node.textValue();
    }
    public void checkRepresentation() {
        if (kind == null || (kind == Kind.SHELF && (shelfId == null || shelfId < 1 || shelfId > 9007199254740991L || room != null || bookcase != null || shelf != null))
            || (kind == Kind.LEGACY && shelfId != null)) throw LocationException.invalid("location");
    }
}

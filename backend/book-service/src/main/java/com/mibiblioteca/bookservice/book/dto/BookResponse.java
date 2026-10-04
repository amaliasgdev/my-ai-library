package com.mibiblioteca.bookservice.book.dto;

import java.time.Instant;

public record BookResponse(
    Long id,
    String title,
    String author,
    String isbn,
    String description,
    Instant createdAt,
    Instant updatedAt
) {
}

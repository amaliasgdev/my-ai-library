package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import java.time.Instant;

public record BookResponse(
    Long id,
    String title,
    String author,
    String isbn,
    String description,
    Instant createdAt,
    Instant updatedAt,
    ReadingStatus readingStatus
) {
    public BookResponse(
        Long id,
        String title,
        String author,
        String isbn,
        String description,
        Instant createdAt,
        Instant updatedAt
    ) {
        this(id, title, author, isbn, description, createdAt, updatedAt, ReadingStatus.TO_READ);
    }
}

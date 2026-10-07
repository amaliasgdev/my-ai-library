package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import java.time.Instant;
import java.time.LocalDate;

public record BookResponse(
    Long id,
    String title,
    String author,
    String isbn,
    String description,
    Instant createdAt,
    Instant updatedAt,
    ReadingStatus readingStatus,
    Integer rating,
    LocalDate startedOn,
    LocalDate finishedOn
) {
}

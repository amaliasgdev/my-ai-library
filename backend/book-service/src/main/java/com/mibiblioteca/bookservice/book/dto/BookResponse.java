package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import java.time.Instant;
import java.time.LocalDate;
import io.swagger.v3.oas.annotations.media.Schema;

public record BookResponse(
    Long id,
    String title,
    String author,
    String isbn,
    String description,
    Instant createdAt,
    Instant updatedAt,
    @Schema(description = "Current reading status; new books default to TO_READ", example = "TO_READ") ReadingStatus readingStatus,
    @Schema(description = "Optional integer rating from 1 to 5; null when not rated", example = "5") Integer rating,
    @Schema(description = "Reading start date in ISO-8601 format", example = "2026-10-01") LocalDate startedOn,
    @Schema(description = "Reading finish date in ISO-8601 format", example = "2026-10-07") LocalDate finishedOn,
    @Schema(description = "Optional HTTP/HTTPS cover reference; null means no cover.", format = "uri", nullable = true, example = "https://example.com/covers/clean-code.jpg") String coverUrl
) {
}

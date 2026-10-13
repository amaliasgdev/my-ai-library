package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
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
    @Schema(description = "Optional HTTP/HTTPS cover reference; null means no cover.", format = "uri", nullable = true, example = "https://example.com/covers/clean-code.jpg") String coverUrl,
    @Schema(example = "Minotauro", nullable = true) String publisher,
    @Schema(example = "2001", nullable = true) Integer publicationYear,
    @Schema(example = "480", nullable = true) Integer pageCount,
    @Schema(description = "Optional two-letter ISO 639-1 code in lowercase", example = "es", nullable = true) String language,
    @Schema(description = "Up to 10 distinct genres, each up to 50 characters; case and order preserved. Empty array when absent.", example = "[\"Fantasía\", \"Aventura\"]") List<String> genres,
    @Schema(description = "Optional physical room; textual label, not a stable location ID", nullable = true, example = "Salón") String room,
    @Schema(nullable = true, example = "Billy izquierda") String bookcase,
    @Schema(description = "Optional textual shelf label", nullable = true, example = "Superior") String shelf,
    Long roomId,
    Long bookcaseId,
    Long shelfId,
    @Schema(description = "True only for a nonempty legacy textual location awaiting explicit reconciliation") boolean locationPending
) {
    public BookResponse {
        genres = genres == null ? List.of() : List.copyOf(genres);
    }
    public BookResponse(Long id, String title, String author, String isbn, String description, Instant createdAt, Instant updatedAt,
                        ReadingStatus readingStatus, Integer rating, LocalDate startedOn, LocalDate finishedOn, String coverUrl,
                        String publisher, Integer publicationYear, Integer pageCount, String language, List<String> genres,
                        String room, String bookcase, String shelf) {
        this(id, title, author, isbn, description, createdAt, updatedAt, readingStatus, rating, startedOn, finishedOn,
            coverUrl, publisher, publicationYear, pageCount, language, genres, room, bookcase, shelf, null, null, null,
            room != null || bookcase != null || shelf != null);
    }
}

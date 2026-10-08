package com.mibiblioteca.bookservice.book.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "External metadata proposal only; unknown fields are null. Review and complete required fields before creating a book.")
public record BookLookupResponse(
    @Schema(example = "9780132350884") String isbn,
    String title,
    @Schema(description = "Complete author names joined with '; ', within 255 characters") String author,
    String publisher,
    Integer publicationYear,
    Integer pageCount,
    @Schema(description = "ISO 639-1 code, or null when unknown or ambiguous", example = "en") String language,
    @Schema(description = "First 10 valid distinct subjects; empty when unknown") List<String> genres,
    @Schema(description = "Cover reference only; image is never downloaded", format = "uri") String coverUrl
) {
    public BookLookupResponse {
        genres = genres == null ? List.of() : List.copyOf(genres);
    }
}

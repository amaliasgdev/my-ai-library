package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.validation.DistinctGenres;
import com.mibiblioteca.bookservice.book.validation.HttpUrl;
import com.mibiblioteca.bookservice.book.validation.IsoLanguage;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record BookRequest(
    @NotBlank @Size(max = 255) String title,
    @NotBlank @Size(max = 255) String author,
    @Size(max = 20)
    @Pattern(
        regexp = "^(?:97[89][- ]?)?[0-9][- 0-9]{8,}[0-9Xx]$",
        message = "isbn must be a valid ISBN-10 or ISBN-13"
    )
    @Schema(description = "ISBN-10 or ISBN-13; hyphens and spaces are accepted and removed before storage", example = "978-0132350884") String isbn,
    @Size(max = 5000) String description,
    @Size(max = 2048)
    @HttpUrl
    @Schema(description = "Optional HTTP/HTTPS cover reference; null or omission means no cover, including on PUT. No image is downloaded.", format = "uri", nullable = true, example = "https://example.com/covers/clean-code.jpg")
    String coverUrl,
    @Size(max = 255)
    @Schema(description = "Optional publisher; trimmed, with blank values stored as null", example = "Minotauro", nullable = true)
    String publisher,
    @Min(1) @Max(2100)
    @Schema(example = "2001", nullable = true) Integer publicationYear,
    @Positive
    @Schema(example = "480", nullable = true) Integer pageCount,
    @IsoLanguage
    @Schema(description = "Optional two-letter ISO 639-1 code recognized by Java; case-insensitive input, stored in lowercase", example = "es", nullable = true)
    String language,
    @Size(max = 10) @DistinctGenres
    @Schema(description = "Genres are trimmed, preserving case and order. Duplicates ignoring case and surrounding spaces are rejected. Omission, null or [] clears genres on PUT.", example = "[\"Fantasía\", \"Aventura\"]", nullable = true)
    List<@NotBlank @Size(max = 50) String> genres
) {
}

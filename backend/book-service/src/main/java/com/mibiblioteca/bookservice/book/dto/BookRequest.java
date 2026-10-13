package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.validation.DistinctGenres;
import com.mibiblioteca.bookservice.book.validation.HttpUrl;
import com.mibiblioteca.bookservice.book.validation.IsoLanguage;
import com.mibiblioteca.bookservice.book.validation.LocationLabel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.mibiblioteca.bookservice.location.LocationException;
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
    @Schema(description = "Optional HTTP/HTTPS cover reference; null or omission means no cover, including on PUT. No image is downloaded. Managed URLs are assigned by POST /api/books/{id}/cover; PUT can only preserve the current managed URL.", format = "uri", nullable = true, example = "https://example.com/covers/clean-code.jpg")
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
    List<@NotBlank @Size(max = 50) String> genres,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @Size(max = 100) @LocationLabel
    @Schema(description = "Optional physical room; trimmed, blanks become null. Omission/null/blank clears it on PUT. Single-line label, preserving case and accents.", nullable = true, example = "Salón") String room,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @Size(max = 100) @LocationLabel
    @Schema(description = "Optional bookcase label; trimmed, blanks become null, including on PUT", nullable = true, example = "Billy izquierda") String bookcase,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @Size(max = 50) @LocationLabel
    @Schema(description = "Optional shelf label, not an integer; trimmed, blanks become null, including on PUT", nullable = true, example = "Superior") String shelf,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @Valid @Schema(description = "Explicit SHELF or LEGACY location; null clears it. Cannot coexist with top-level room/bookcase/shelf, even null.", nullable = true) BookLocationRequest location
) {
    public BookRequest(String title, String author, String isbn, String description, String coverUrl, String publisher,
                       Integer publicationYear, Integer pageCount, String language, List<String> genres, String room, String bookcase, String shelf) {
        this(title, author, isbn, description, coverUrl, publisher, publicationYear, pageCount, language, genres, room, bookcase, shelf, null);
    }

    // JsonNode preserves explicit null vs omitted properties at this compatibility boundary.
    @JsonCreator
    public static BookRequest fromJson(
        @JsonProperty("title") String title, @JsonProperty("author") String author,
        @JsonProperty("isbn") String isbn, @JsonProperty("description") String description,
        @JsonProperty("coverUrl") String coverUrl, @JsonProperty("publisher") String publisher,
        @JsonProperty("publicationYear") Integer year, @JsonProperty("pageCount") Integer pages,
        @JsonProperty("language") String language, @JsonProperty("genres") List<String> genres,
        @JsonProperty("room") JsonNode room, @JsonProperty("bookcase") JsonNode bookcase,
        @JsonProperty("shelf") JsonNode shelf, @JsonProperty("location") JsonNode location
    ) {
        if (location != null && (room != null || bookcase != null || shelf != null)) throw LocationException.invalid("location");
        return new BookRequest(title, author, isbn, description, coverUrl, publisher, year, pages, language, genres,
            BookLocationRequest.text(room), BookLocationRequest.text(bookcase), BookLocationRequest.text(shelf), BookLocationRequest.fromJson(location));
    }
}

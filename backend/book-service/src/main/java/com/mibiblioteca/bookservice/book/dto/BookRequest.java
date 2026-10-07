package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

public record BookRequest(
    @NotBlank @Size(max = 255) String title,
    @NotBlank @Size(max = 255) String author,
    @Size(max = 20)
    @Pattern(
        regexp = "^(?:97[89][- ]?)?[0-9][- 0-9]{8,}[0-9Xx]$",
        message = "isbn must be a valid ISBN-10 or ISBN-13"
    )
    @Schema(description = "ISBN-10 or ISBN-13; hyphens and spaces are accepted and removed before storage", example = "978-0132350884") String isbn,
    @Size(max = 5000) String description
) {
}

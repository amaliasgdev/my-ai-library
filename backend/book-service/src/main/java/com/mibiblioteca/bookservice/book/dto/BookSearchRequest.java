package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record BookSearchRequest(
    @Size(max = 255) String title,
    @Size(max = 255) String author,
    @Size(max = 20)
    @Pattern(
        regexp = "^(?:97[89][- ]?)?[0-9][- 0-9]{8,}[0-9Xx]$",
        message = "isbn must be a valid ISBN-10 or ISBN-13"
    )
    String isbn
) {
}

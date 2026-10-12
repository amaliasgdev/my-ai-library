package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import io.swagger.v3.oas.annotations.media.Schema;

public record ReadingDateRequest(@NotNull @Schema(description = "Reading date in ISO-8601 format", example = "2026-10-04") LocalDate date) {
}

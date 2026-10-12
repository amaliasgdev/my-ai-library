package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateRatingRequest(@NotNull @Min(1) @Max(5) Integer rating) {
}

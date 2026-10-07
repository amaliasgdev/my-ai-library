package com.mibiblioteca.bookservice.book.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record ReadingDateRequest(@NotNull LocalDate date) {
}

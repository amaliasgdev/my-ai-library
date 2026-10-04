package com.mibiblioteca.bookservice.book.dto;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateReadingStatusRequest(@NotNull ReadingStatus readingStatus) {
}

package com.mibiblioteca.bookservice.book.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record BookPageResponse(
    List<BookResponse> content,
    @Schema(description = "Zero-based page number", example = "0") int page,
    @Schema(description = "Requested page size", example = "20") int size,
    @Schema(description = "Total number of matching books", example = "51") long totalElements,
    @Schema(description = "Total number of pages", example = "3") int totalPages
) {
}

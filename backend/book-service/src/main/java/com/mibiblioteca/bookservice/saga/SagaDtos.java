package com.mibiblioteca.bookservice.saga;

import com.mibiblioteca.bookservice.book.validation.HttpUrl;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class SagaDtos {
    private SagaDtos() {
    }

    public record SagaRequest(
        @NotBlank @Size(max = 255)
        @Schema(description = "Required saga name; surrounding spaces are removed before storage", example = "Nacidos de la bruma")
        String name,
        @Size(max = 255)
        @Schema(description = "Optional author; surrounding spaces are removed and blank values are stored as null", example = "Brandon Sanderson", nullable = true)
        String author,
        @Size(max = 5000)
        @Schema(description = "Optional description; newlines are preserved", example = "Saga de fantasía ambientada en Scadrial", nullable = true)
        String description,
        @Size(max = 2048)
        @HttpUrl
        @Schema(description = "Optional HTTP/HTTPS representative image reference; no image is downloaded", format = "uri", example = "https://example.com/covers/mistborn.jpg", nullable = true)
        String imageUrl
    ) {
    }

    public record SagaProgressResponse(
        int total,
        int linked,
        int pending,
        int read,
        int reading,
        int toRead,
        int abandoned
    ) {
        public static SagaProgressResponse zero() {
            return new SagaProgressResponse(0, 0, 0, 0, 0, 0, 0);
        }
    }

    public record SagaResponse(
        Long id,
        String name,
        String author,
        String description,
        String imageUrl,
        @Schema(description = "Revision as a canonical decimal string for JavaScript interoperability", example = "0")
        String revision,
        Instant createdAt,
        Instant updatedAt,
        SagaProgressResponse progress
    ) {
    }

    public record SagaPageResponse(
        List<SagaResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages
    ) {
        public SagaPageResponse {
            content = content == null ? List.of() : List.copyOf(content);
        }
    }
}

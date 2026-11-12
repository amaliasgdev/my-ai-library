package com.mibiblioteca.bookservice.saga;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.validation.HttpUrl;
import com.mibiblioteca.bookservice.readinglist.RevisionStringDeserializer;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
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

    public record AddSagaVolumeRequest(
        @Positive
        @Schema(description = "Existing book to link; mutually exclusive with pendingTitle", example = "12", nullable = true)
        Long bookId,
        @Size(max = 255)
        @Schema(description = "Provisional title for a pending volume; mutually exclusive with bookId", example = "El pozo de la ascensión", nullable = true)
        String pendingTitle,
        @Size(max = 40)
        @Schema(description = "Visible label independent from the internal position; null means no label", example = "0.5", nullable = true)
        String volumeLabel,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "0")
        String expectedRevision
    ) {
    }

    public record UpdateSagaVolumeRequest(
        @Size(max = 40)
        @Schema(description = "Visible label; null clears it", example = "Precuela", nullable = true)
        String volumeLabel,
        @Size(max = 255)
        @Schema(description = "Replacement provisional title; required for pending volumes and forbidden for linked volumes", example = "Novela corta", nullable = true)
        String pendingTitle,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "3")
        String expectedRevision
    ) {
    }

    public record LinkSagaVolumeRequest(
        @NotNull @Positive
        @Schema(description = "Existing book to link to this pending volume", example = "12")
        Long bookId,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "4")
        String expectedRevision
    ) {
    }

    public record UnlinkSagaVolumeRequest(
        @Size(max = 255)
        @Schema(description = "Optional provisional title after unlinking; defaults to the book's current title", example = "Título conservado", nullable = true)
        String pendingTitle,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "5")
        String expectedRevision
    ) {
    }

    public record MoveSagaVolumeRequest(
        @NotNull @Positive
        @Schema(description = "Absolute target position inside this saga", example = "1")
        Integer toPosition,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "6")
        String expectedRevision
    ) {
    }

    public record SagaVolumeBookResponse(
        Long id,
        String title,
        String author,
        String coverUrl,
        ReadingStatus readingStatus,
        Integer rating,
        LocalDate finishedOn
    ) {
    }

    public record SagaVolumeResponse(
        Long id,
        int position,
        String volumeLabel,
        Long bookId,
        SagaVolumeBookResponse book,
        String pendingTitle,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record SagaVolumesResponse(
        String revision,
        SagaProgressResponse progress,
        List<SagaVolumeResponse> volumes
    ) {
        public SagaVolumesResponse {
            volumes = volumes == null ? List.of() : List.copyOf(volumes);
        }
    }

    public record SagaVolumeMutationResponse(String revision, SagaVolumeResponse volume) {
    }

    public record SagaVolumeMoveResponse(String revision, Long volumeId, int position) {
    }

    public record SagaRevisionResponse(String revision) {
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

package com.mibiblioteca.bookservice.readinglist;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Instant;
import java.util.List;

public final class ReadingListDtos {
    private ReadingListDtos() { }

    public record AddReadingListItemRequest(
        @NotNull @Positive @Max(9007199254740991L) Long bookId,
        @NotNull @JsonDeserialize(using = RevisionStringDeserializer.class)
        @Schema(description = "Expected nonnegative BIGINT revision as a canonical decimal string", example = "0")
        String expectedRevision
    ) { }

    public record ReadingListItemResponse(Long entryId, int position, Instant addedAt, BookResponse book) { }

    public record ReadingListResponse(String revision, long totalItems, List<ReadingListItemResponse> items) { }

    public record ReadingListMembershipItem(Long bookId, boolean included, Long entryId) { }

    public record ReadingListMembershipResponse(String revision, List<ReadingListMembershipItem> items) { }

    public record ReadingListAddResponse(String revision, ReadingListItemResponse item) { }

    public record ReadingListRevisionResponse(String revision) { }
}

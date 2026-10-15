package com.mibiblioteca.bookservice.location.reconciliation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

public final class ReconciliationDtos {
    private ReconciliationDtos() {}
    public enum Type { ALL, COMPLETE, PARTIAL }
    public enum Match { EXACT, NONE, AMBIGUOUS, NOT_APPLICABLE }
    public record Labels(@NotBlank @Size(max = 100) String room,
                         @NotBlank @Size(max = 100) String bookcase,
                         @NotBlank @Size(max = 50) String shelf) {}
    public record Destination(long roomId, String roomName, long bookcaseId, String bookcaseName,
                              long shelfId, String shelfName) {
        public Labels labels() { return new Labels(roomName, bookcaseName, shelfName); }
    }
    public record Group(String groupKey, String room, String bookcase, String shelf, long variantCount,
                        long bookCount, Type type, Match match, Destination destinationSuggestion) {}
    public record Statistics(long pendingGroups, long pendingBooks, long completeGroups, long partialGroups) {}
    public record GroupsPage(List<Group> content, int page, int size, long totalElements, long totalPages,
                             Statistics statistics) {}
    public record LegacyBook(long id, String title, String author, String isbn, String room, String bookcase, String shelf) {}
    public record Variant(String room, String bookcase, String shelf, long bookCount) {}
    public record Detail(Group group, List<Variant> variants, List<LegacyBook> content, int page, int size,
                         long totalElements, long totalPages, String reviewToken, String snapshotFingerprint, long reviewedCount, Instant expiresAt) {}
    public record AssignRequest(@NotBlank @Size(max = 4096) String reviewToken,
                                @NotNull @Min(1) @Max(9007199254740991L) Long shelfId,
                                @NotNull @Valid Labels expectedDestination) {}
    public record Assigned(long affectedCount, long shelfId) {}
}

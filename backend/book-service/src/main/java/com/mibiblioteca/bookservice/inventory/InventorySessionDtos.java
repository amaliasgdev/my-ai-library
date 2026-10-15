package com.mibiblioteca.bookservice.inventory;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class InventorySessionDtos {
    private InventorySessionDtos() {}
    public record CreateInventorySessionRequest(@Size(max = 2000) String notes) {}
    public record UpdateInventorySessionNotesRequest(@Size(max = 2000) String notes) {
        @JsonCreator
        public UpdateInventorySessionNotesRequest(@JsonProperty(value = "notes", required = true) String notes) { this.notes = notes; }
    }
    public record InventoryShelfContext(long roomId, String roomName, long bookcaseId, String bookcaseName, long shelfId, String shelfName) {}
    public record InventorySessionResponse(long id, InventoryShelfContext shelf, InventorySessionStatus status,
        String notes, Instant createdAt, Instant updatedAt, Instant startedAt, Instant completedAt, Instant cancelledAt) {}
    public record InventorySessionSummary(long id, InventorySessionStatus status, String notes,
        Instant createdAt, Instant updatedAt, Instant startedAt, Instant completedAt, Instant cancelledAt) {}
    public record ShelfInventorySessionsResponse(InventoryShelfContext shelf, InventorySessionSummary activeSession,
        List<InventorySessionSummary> content, int page, int size, long totalElements, int totalPages) {}
}

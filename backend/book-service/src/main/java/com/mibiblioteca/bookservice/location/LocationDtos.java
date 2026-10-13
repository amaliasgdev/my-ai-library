package com.mibiblioteca.bookservice.location;

import com.mibiblioteca.bookservice.book.validation.LocationLabel;
import jakarta.validation.constraints.*;
import java.util.List;

public final class LocationDtos {
    private LocationDtos() {}
    public record NameRequest(@NotNull @Size(max = 100) @LocationLabel String name) {}
    public record BookcaseRequest(@NotNull @Min(1) @Max(9007199254740991L) Long roomId,
                                 @NotNull @Size(max = 100) @LocationLabel String name) {}
    public record ShelfRequest(@NotNull @Min(1) @Max(9007199254740991L) Long bookcaseId,
                              @NotNull @Size(max = 50) @LocationLabel String name) {}
    public record ShelfNameRequest(@NotNull @Size(max = 50) @LocationLabel String name) {}
    public record Item(Long id, String name) {}
    public record ShelfNode(Long id, String name, long bookCount, boolean canDelete, String blockedReason) {}
    public record BookcaseNode(Long id, String name, long bookCount, boolean canDelete, String blockedReason, List<ShelfNode> shelves) {}
    public record RoomNode(Long id, String name, long bookCount, boolean canDelete, String blockedReason, List<BookcaseNode> bookcases) {}
}

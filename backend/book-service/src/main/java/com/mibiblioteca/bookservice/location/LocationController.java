package com.mibiblioteca.bookservice.location;

import static com.mibiblioteca.bookservice.location.LocationDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class LocationController {
    private final LocationService service;
    public LocationController(LocationService service) { this.service = service; }

    @GetMapping("/locations") @Operation(summary = "Read physical hierarchy and book counts", description = "Legacy textual books are not reconciled or included in structured counts. canDelete is advisory; DELETE checks again.")
    public List<RoomNode> hierarchy() { return service.hierarchy(); }

    @PostMapping("/rooms") @Operation(summary = "Create room")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Item> createRoom(@Valid @RequestBody NameRequest request) { return created("rooms", service.createRoom(request.name())); }
    @PutMapping("/rooms/{id}") @Operation(summary = "Rename room")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public Item renameRoom(@PathVariable Long id, @Valid @RequestBody NameRequest request) { return service.renameRoom(id, request.name()); }
    @DeleteMapping("/rooms/{id}") @Operation(summary = "Delete empty room", description = "Blocked while it has bookcases; never cascades.")
    @ApiResponse(responseCode = "204", description = "Deleted") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Void> deleteRoom(@PathVariable Long id) { service.deleteRoom(id); return ResponseEntity.noContent().build(); }

    @PostMapping("/bookcases") @Operation(summary = "Create bookcase in room")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Item> createBookcase(@Valid @RequestBody BookcaseRequest request) { return created("bookcases", service.createBookcase(request.roomId(), request.name())); }
    @PutMapping("/bookcases/{id}") @Operation(summary = "Rename bookcase", description = "Does not change its parent.")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public Item renameBookcase(@PathVariable Long id, @Valid @RequestBody NameRequest request) { return service.renameBookcase(id, request.name()); }
    @DeleteMapping("/bookcases/{id}") @Operation(summary = "Delete empty bookcase", description = "Blocked while it has shelves; never cascades.")
    @ApiResponse(responseCode = "204", description = "Deleted") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Void> deleteBookcase(@PathVariable Long id) { service.deleteBookcase(id); return ResponseEntity.noContent().build(); }

    @PostMapping("/shelves") @Operation(summary = "Create shelf in bookcase")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Item> createShelf(@Valid @RequestBody ShelfRequest request) { return created("shelves", service.createShelf(request.bookcaseId(), request.name())); }
    @PutMapping("/shelves/{id}") @Operation(summary = "Rename shelf", description = "Does not change its parent or stable ID.")
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public Item renameShelf(@PathVariable Long id, @Valid @RequestBody ShelfNameRequest request) { return service.renameShelf(id, request.name()); }
    @DeleteMapping("/shelves/{id}") @Operation(summary = "Delete unused shelf", description = "Blocked while books reference it; never deletes books.")
    @ApiResponse(responseCode = "204", description = "Deleted") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<Void> deleteShelf(@PathVariable Long id) { service.deleteShelf(id); return ResponseEntity.noContent().build(); }

    private ResponseEntity<Item> created(String resource, Item item) { return ResponseEntity.created(URI.create("/api/" + resource + "/" + item.id())).body(item); }
}

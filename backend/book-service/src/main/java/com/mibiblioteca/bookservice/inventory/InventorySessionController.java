package com.mibiblioteca.bookservice.inventory;

import static com.mibiblioteca.bookservice.inventory.InventorySessionDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class InventorySessionController {
    private final InventorySessionService service;
    public InventorySessionController(InventorySessionService service) { this.service = service; }

    @ExceptionHandler(InventorySessionException.class)
    public ProblemDetail inventory(InventorySessionException ex) {
        var problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        problem.setProperty("code", ex.code()); return problem;
    }
    @ExceptionHandler(org.springframework.dao.ConcurrencyFailureException.class)
    public ProblemDetail conflict(org.springframework.dao.ConcurrencyFailureException ex) { return inventory(InventorySessionException.conflict()); }

    @PostMapping("/api/shelves/{shelfId}/inventory-sessions")
    @Operation(summary = "Start inventory for a shelf", description = "Starts IN_PROGRESS immediately. Optional notes, at most 2000 original characters before trim. At most one active session per shelf; never modifies Books.")
    @ApiResponse(responseCode = "201", description = "Started session", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<InventorySessionResponse> create(@PathVariable @Min(1) @Max(9007199254740991L) long shelfId, @Valid @RequestBody(required = false) CreateInventorySessionRequest request) {
        var result = service.create(shelfId, request);
        return ResponseEntity.created(URI.create("/api/inventory-sessions/" + result.id())).body(result);
    }
    @GetMapping("/api/shelves/{shelfId}/inventory-sessions")
    @Operation(summary = "List shelf inventory history", description = "Fixed startedAt DESC, id DESC order. Active session is returned independently of the requested page. Current hierarchy names, not historical snapshots.")
    @ApiResponse(responseCode = "200", description = "Shelf context, active session and paginated history", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound")
    public ShelfInventorySessionsResponse history(@PathVariable @Min(1) @Max(9007199254740991L) long shelfId,
        @RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) { return service.history(shelfId, page, size); }

    @GetMapping("/api/inventory-sessions/{id}")
    @Operation(summary = "Get inventory session", description = "Includes the current Room/Bookcase/Shelf context. Terminal sessions are read-only.")
    @ApiResponse(responseCode = "200", description = "Inventory session", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound")
    public InventorySessionResponse get(@PathVariable @Min(1) @Max(9007199254740991L) long id) { return service.get(id); }

    @PostMapping("/api/inventory-sessions/{id}/complete")
    @Operation(summary = "Complete inventory session", description = "IN_PROGRESS to COMPLETED only. Cannot reopen or repeat. Does not compare or modify catalog Books.")
    @ApiResponse(responseCode = "200", description = "Completed session", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public InventorySessionResponse complete(@PathVariable @Min(1) @Max(9007199254740991L) long id) { return service.complete(id); }

    @PostMapping("/api/inventory-sessions/{id}/cancel")
    @Operation(summary = "Cancel inventory session", description = "IN_PROGRESS to CANCELLED only. Retains history; cannot reopen or repeat.")
    @ApiResponse(responseCode = "200", description = "Cancelled session", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public InventorySessionResponse cancel(@PathVariable @Min(1) @Max(9007199254740991L) long id) { return service.cancel(id); }

    @PutMapping("/api/inventory-sessions/{id}/notes")
    @Operation(summary = "Replace active inventory session notes", description = "notes property required; null clears. Original maximum length 2000 before exterior trim; interior spaces/newlines preserved. Closed session returns 409.")
    @ApiResponse(responseCode = "200", description = "Updated session", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", ref = "BadRequest") @ApiResponse(responseCode = "404", ref = "NotFound") @ApiResponse(responseCode = "409", ref = "Conflict")
    public InventorySessionResponse notes(@PathVariable @Min(1) @Max(9007199254740991L) long id, @Valid @RequestBody UpdateInventorySessionNotesRequest request) { return service.notes(id, request); }
}

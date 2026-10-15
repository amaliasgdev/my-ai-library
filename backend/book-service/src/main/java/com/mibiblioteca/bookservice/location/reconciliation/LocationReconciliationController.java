package com.mibiblioteca.bookservice.location.reconciliation;

import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/locations/reconciliation")
public class LocationReconciliationController {
    @ExceptionHandler(org.springframework.dao.ConcurrencyFailureException.class)
    public org.springframework.http.ProblemDetail concurrency(org.springframework.dao.ConcurrencyFailureException ex) {
        var problem=org.springframework.http.ProblemDetail.forStatusAndDetail(org.springframework.http.HttpStatus.CONFLICT,"Concurrent change. Reload and review the group again");
        problem.setProperty("code","RECONCILIATION_STALE");
        return problem;
    }
    private final LocationReconciliationService service;
    public LocationReconciliationController(LocationReconciliationService service) { this.service=service; }
    @GetMapping
    @Operation(summary="List pending legacy location groups",description="Exact case-insensitive, accent-sensitive grouping; no automatic conversion. Statistics are global, pagination totals are filtered.")
    @ApiResponse(responseCode="200",description="Paged legacy groups and global statistics",useReturnTypeSchema=true)
    @ApiResponse(responseCode="400",ref="BadRequest")
    public GroupsPage groups(@RequestParam(defaultValue="0") @Min(0) int page,
                             @RequestParam(defaultValue="20") @Min(1) @Max(100) int size,
                             @RequestParam(defaultValue="ALL") Type type,
                             @RequestParam(required=false) @Size(max=255) String text) {
        return service.groups(page,size,type,text);
    }
    @GetMapping("/{groupKey}")
    @Operation(summary="Review a legacy group",description="Returns original variants, a page of book summaries and a signed short-lived review of the entire group, not just the page.")
    @ApiResponse(responseCode="200",description="Reviewed group and paginated book summaries",useReturnTypeSchema=true)
    @ApiResponse(responseCode="400",ref="BadRequest") @ApiResponse(responseCode="404",ref="NotFound")
    public Detail detail(@PathVariable @Size(max=2048) String groupKey,
                         @RequestParam(defaultValue="0") @Min(0) int page,
                         @RequestParam(defaultValue="20") @Min(1) @Max(100) int size) { return service.detail(groupKey,page,size); }
    @PostMapping("/assign")
    @Operation(summary="Explicitly reconcile a reviewed legacy group",description="All or nothing. Locks the destination and group, verifies membership and original labels, then changes only verified IDs. No undo/history or automatic retry.")
    @ApiResponse(responseCode="200",description="Committed affected count and Shelf ID",useReturnTypeSchema=true)
    @ApiResponse(responseCode="400",ref="BadRequest") @ApiResponse(responseCode="404",ref="NotFound") @ApiResponse(responseCode="409",ref="Conflict")
    public Assigned assign(@Valid @RequestBody AssignRequest request) { return service.assign(request); }
}

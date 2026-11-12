package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaPageResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.net.URI;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sagas")
@Tag(name = "Sagas", description = "Literary saga management")
public class SagaController {

    private final SagaService service;

    public SagaController(SagaService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(
        summary = "List sagas",
        description = "Paged, sortable and optionally filtered by a case-insensitive partial name. "
            + "Results are ordered by the requested field with id ASC as a deterministic tie-breaker. "
            + "Sagas have no volumes yet, so every progress counter is zero."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Paged saga list"),
        @ApiResponse(responseCode = "400", ref = "BadRequest")
    })
    public SagaPageResponse findAll(
        @Parameter(description = "Zero-based page number", example = "0")
        @RequestParam(defaultValue = "0") @Min(0) int page,
        @Parameter(description = "Page size from 1 to 100", example = "20")
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
        @Parameter(description = "Sort field", example = "name",
            schema = @Schema(allowableValues = {"name", "author", "createdAt", "updatedAt"}, defaultValue = "name"))
        @RequestParam(defaultValue = "name") String sortBy,
        @Parameter(description = "Sort direction", example = "ASC",
            schema = @Schema(allowableValues = {"ASC", "DESC"}, defaultValue = "ASC"))
        @RequestParam(defaultValue = "ASC") Sort.Direction direction,
        @Parameter(description = "Optional case-insensitive partial name filter", example = "bruma")
        @RequestParam(required = false) @Size(max = 255) String name
    ) {
        return service.findAll(page, size, sortBy, direction, name);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a saga by ID")
    @ApiResponse(responseCode = "404", ref = "NotFound")
    public SagaResponse findById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PostMapping
    @Operation(
        summary = "Create a saga",
        description = "Creates an empty saga with revision 0 and zero progress. "
            + "No book is created and no reading-list entry is added."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Saga created; Location identifies it"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public ResponseEntity<SagaResponse> create(@Valid @RequestBody SagaRequest request) {
        SagaResponse response = service.create(request);
        return ResponseEntity.created(URI.create("/api/sagas/" + response.id())).body(response);
    }

    @PutMapping("/{id}")
    @Operation(
        summary = "Update a saga",
        description = "Requires exactly one expectedRevision query parameter. The saga row is locked, "
            + "the revision is checked before writing and incremented exactly once per effective update. "
            + "Only saga metadata changes; books and the reading list are untouched."
    )
    @Parameter(name = "expectedRevision", in = ParameterIn.QUERY, required = true,
        schema = @Schema(type = "string", example = "0"),
        description = "Expected nonnegative BIGINT revision as a canonical decimal string")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Saga updated; returns the new revision"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaResponse update(@PathVariable Long id, @Valid @RequestBody SagaRequest request,
        @Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        return service.update(id, request, SagaParameters.single(parameters, "expectedRevision"));
    }

    @DeleteMapping("/{id}")
    @Operation(
        summary = "Delete a saga",
        description = "Requires exactly one expectedRevision query parameter. The saga row is locked and "
            + "the revision is checked before deletion. The saga is removed; no book is deleted."
    )
    @Parameter(name = "expectedRevision", in = ParameterIn.QUERY, required = true,
        schema = @Schema(type = "string", example = "0"),
        description = "Expected nonnegative BIGINT revision as a canonical decimal string")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Saga deleted"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public ResponseEntity<Void> delete(@PathVariable Long id,
        @Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        service.delete(id, SagaParameters.single(parameters, "expectedRevision"));
        return ResponseEntity.noContent().build();
    }
}

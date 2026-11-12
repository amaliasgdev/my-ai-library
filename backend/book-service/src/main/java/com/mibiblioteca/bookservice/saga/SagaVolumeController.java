package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.LinkSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.MoveSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaRevisionResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeMoveResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeMutationResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumesResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.UnlinkSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.UpdateSagaVolumeRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
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
@RequestMapping("/api/sagas/{sagaId}/volumes")
@Tag(name = "Sagas", description = "Literary saga management")
public class SagaVolumeController {

    private final SagaVolumeService service;

    public SagaVolumeController(SagaVolumeService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(
        summary = "List the ordered volumes of a saga",
        description = "Returns contiguous positions 1..n, the current saga revision, derived progress "
            + "and linked or pending volumes. Pending volumes have no reading status."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Ordered volumes and their consistent revision"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public SagaVolumesResponse findAll(@PathVariable Long sagaId) {
        return service.findAll(sagaId);
    }

    @PostMapping
    @Operation(
        summary = "Append a volume at the end of a saga",
        description = "Accepts either an existing bookId or a pendingTitle, never both. "
            + "A pending volume never creates a Book. The expectedRevision is checked after locking the saga."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Volume appended; Location identifies it"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public ResponseEntity<SagaVolumeMutationResponse> add(@PathVariable Long sagaId,
        @Valid @RequestBody AddSagaVolumeRequest request) {
        SagaVolumeMutationResponse response = service.add(sagaId, request);
        URI location = URI.create("/api/sagas/" + sagaId + "/volumes/" + response.volume().id());
        return ResponseEntity.created(location).body(response);
    }

    @PutMapping("/{volumeId}")
    @Operation(
        summary = "Edit a volume label or a pending title",
        description = "Replaces volumeLabel. Pending volumes also require pendingTitle; linked volumes "
            + "keep their book title and reject a pendingTitle. An unchanged request is a no-op "
            + "and does not increment the revision."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Volume updated or unchanged"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaVolumeMutationResponse update(@PathVariable Long sagaId, @PathVariable Long volumeId,
        @Valid @RequestBody UpdateSagaVolumeRequest request) {
        return service.update(sagaId, volumeId, request);
    }

    @PostMapping("/{volumeId}/move")
    @Operation(
        summary = "Move a volume to an absolute position",
        description = "Position is relative to the complete saga and must be between 1 and its current "
            + "size. Only the affected interval shifts. Moving to the current position is a no-op "
            + "and leaves the revision unchanged."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Confirmed position and revision"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaVolumeMoveResponse move(@PathVariable Long sagaId, @PathVariable Long volumeId,
        @Valid @RequestBody MoveSagaVolumeRequest request) {
        return service.move(sagaId, volumeId, request);
    }

    @DeleteMapping("/{volumeId}")
    @Operation(
        summary = "Remove a volume from a saga",
        description = "Requires exactly one expectedRevision query parameter. Later positions compact "
            + "atomically. Removing a volume never deletes its book."
    )
    @Parameter(name = "expectedRevision", in = ParameterIn.QUERY, required = true,
        schema = @Schema(type = "string", example = "3"),
        description = "Expected nonnegative BIGINT revision as a canonical decimal string")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Volume removed; returns the new revision"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaRevisionResponse remove(@PathVariable Long sagaId, @PathVariable Long volumeId,
        @Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        return service.remove(sagaId, volumeId,
            SagaParameters.single(parameters, "expectedRevision"));
    }

    @PostMapping("/{volumeId}/link")
    @Operation(
        summary = "Link a pending volume to an existing book",
        description = "Updates the same saga_volume row: id, position and label are preserved and "
            + "pendingTitle is cleared. The book may belong to other sagas, but not twice to this one. "
            + "Linking the already linked book is a no-op."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Volume linked or already linked to that book"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaVolumeMutationResponse link(@PathVariable Long sagaId, @PathVariable Long volumeId,
        @Valid @RequestBody LinkSagaVolumeRequest request) {
        return service.link(sagaId, volumeId, request);
    }

    @PostMapping("/{volumeId}/unlink")
    @Operation(
        summary = "Unlink a book and turn the volume back into a pending one",
        description = "Preserves the volume id, position and label. The provisional title defaults to "
            + "the book's current title and can be replaced explicitly. The book itself is untouched."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Volume unlinked and kept as pending"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public SagaVolumeMutationResponse unlink(@PathVariable Long sagaId, @PathVariable Long volumeId,
        @Valid @RequestBody UnlinkSagaVolumeRequest request) {
        return service.unlink(sagaId, volumeId, request);
    }
}

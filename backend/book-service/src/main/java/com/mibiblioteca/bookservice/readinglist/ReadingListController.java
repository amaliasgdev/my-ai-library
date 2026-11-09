package com.mibiblioteca.bookservice.readinglist;

import static com.mibiblioteca.bookservice.readinglist.ReadingListDtos.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reading-list")
@Tag(name = "Reading list")
public class ReadingListController {
    private final ReadingListService service;

    public ReadingListController(ReadingListService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "Get the personal reading list", description = "Always in global position order, without pagination. totalItems counts all entries; a state filter preserves their global positions. revision is a decimal string. Revision, entries and total use one consistent database snapshot.")
    @Parameter(name = "readingStatus", in = ParameterIn.QUERY, schema = @Schema(implementation = com.mibiblioteca.bookservice.book.ReadingStatus.class))
    @ApiResponse(responseCode = "200", description = "Ordered list and its consistent revision")
    @ApiResponse(responseCode = "400", ref = "BadRequest")
    public ReadingListResponse get(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        return service.getList(ReadingListParameters.status(parameters));
    }

    @GetMapping("/membership")
    @Operation(summary = "Check reading list membership in a batch", description = "Repeat bookId (no comma-separated values), at most 100 unique positive safe-integer IDs. Duplicates are collapsed in first-occurrence order. Missing books and books not in the list return included=false and entryId=null. Includes the consistent current revision.")
    @Parameter(name = "bookId", in = ParameterIn.QUERY, required = true,
        array = @ArraySchema(schema = @Schema(type = "integer", format = "int64", minimum = "1", maximum = "9007199254740991")))
    @ApiResponse(responseCode = "200", description = "Batched membership and its consistent revision")
    @ApiResponse(responseCode = "400", ref = "BadRequest")
    public ReadingListMembershipResponse membership(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        return service.membership(ReadingListParameters.bookIds(parameters));
    }

    @PostMapping("/items")
    @Operation(summary = "Append an existing book", description = "Locks the singleton and checks expectedRevision before validation/writes. Duplicate or stale revision returns 409. Changes no Book fields.")
    @ApiResponse(responseCode = "201", description = "Entry appended; Location identifies the entry")
    @ApiResponse(responseCode = "400", ref = "BadRequest")
    @ApiResponse(responseCode = "404", ref = "NotFound")
    @ApiResponse(responseCode = "409", ref = "Conflict")
    public ResponseEntity<ReadingListAddResponse> add(@Valid @RequestBody AddReadingListItemRequest request) {
        var response = service.add(request);
        return ResponseEntity.created(URI.create("/api/reading-list/items/" + response.item().entryId())).body(response);
    }

    @DeleteMapping("/items/{entryId}")
    @Operation(summary = "Remove an entry without deleting its book", description = "Requires exactly one expectedRevision query parameter. Compacts later positions atomically and increments revision once. Stale revision is checked before entry existence.")
    @Parameter(name = "expectedRevision", in = ParameterIn.QUERY, required = true, schema = @Schema(type = "string", example = "1"))
    @ApiResponse(responseCode = "200", description = "Entry removed; returns the new revision")
    @ApiResponse(responseCode = "400", ref = "BadRequest")
    @ApiResponse(responseCode = "404", ref = "NotFound")
    @ApiResponse(responseCode = "409", ref = "Conflict")
    public ReadingListRevisionResponse remove(@PathVariable String entryId,
        @Parameter(hidden = true) @RequestParam MultiValueMap<String, String> parameters) {
        return service.remove(ReadingListParameters.id(entryId, "entryId"), ReadingListParameters.single(parameters, "expectedRevision"));
    }
}

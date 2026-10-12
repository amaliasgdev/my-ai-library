package com.mibiblioteca.bookservice.book.api;

import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;
import com.mibiblioteca.bookservice.book.lookup.BookLookupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BookLookupController {
    private final BookLookupService service;

    public BookLookupController(BookLookupService service) { this.service = service; }

    @GetMapping("/api/books/isbn-lookup")
    @Operation(summary = "Look up external book metadata by ISBN", description = "Queries Open Library only; does not read or write the local library. Partial metadata is possible and must be reviewed before creation. ISBN-10/13 checksum is validated; spaces and hyphens are accepted.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Metadata proposal", content = @Content(mediaType = "application/json", schema = @Schema(implementation = BookLookupResponse.class))),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "502", ref = "BookProviderBadGateway"),
        @ApiResponse(responseCode = "503", ref = "BookProviderUnavailable"),
        @ApiResponse(responseCode = "504", ref = "BookProviderTimeout")
    })
    public BookLookupResponse lookup(@Parameter(example = "978-0132350884") @RequestParam String isbn) {
        return service.lookup(isbn);
    }
}

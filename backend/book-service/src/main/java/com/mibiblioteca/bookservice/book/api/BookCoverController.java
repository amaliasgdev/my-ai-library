package com.mibiblioteca.bookservice.book.api;

import com.mibiblioteca.bookservice.book.cover.BookCoverService;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/books/{id}/cover")
public class BookCoverController {
    private final BookCoverService service;
    public BookCoverController(BookCoverService service) { this.service = service; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload or replace a book cover", description = "Required multipart part 'file': JPEG/image/jpeg or static PNG/image/png only, maximum 5 MiB (5242880 bytes). Maximum 6000 per axis and 20000000 pixels. Original filename is ignored. Returns the complete book; physical cleanup follows commit.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Cover associated with the book"),
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "413", ref = "CoverTooLarge"),
        @ApiResponse(responseCode = "415", ref = "CoverUnsupported"),
        @ApiResponse(responseCode = "500", ref = "CoverFailure")
    })
    public BookResponse upload(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
        return service.upload(id, file);
    }

    @DeleteMapping
    @Operation(summary = "Remove a book cover", description = "Idempotent for an existing book. Clears external URLs without external calls; deletes managed files after commit. Post-commit cleanup failure is logged and does not change the successful response.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Cover reference cleared"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "500", ref = "CoverFailure")
    })
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}

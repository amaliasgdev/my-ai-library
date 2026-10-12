package com.mibiblioteca.bookservice.book.api;

import com.mibiblioteca.bookservice.book.cover.CoverStorage;
import com.mibiblioteca.bookservice.book.cover.ValidatedCover;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CoverContentController {
    private final CoverStorage storage;
    public CoverContentController(CoverStorage storage) { this.storage = storage; }

    @GetMapping("/api/covers/{filename}")
    @Operation(summary = "Read a managed cover", description = "Public image bytes only. Invalid identifiers, temporary files and missing images return 404. No directory listing. Each replacement has a new URL; cached images may remain available for one day after deletion.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Cover image", content = {
            @Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
            @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))}),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "500", ref = "CoverFailure")
    })
    public ResponseEntity<byte[]> read(@PathVariable String filename) {
        ValidatedCover cover = storage.read(filename);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(cover.format().mediaType()))
            .contentLength(cover.bytes().length)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(filename).build().toString())
            .header("X-Content-Type-Options", "nosniff")
            .cacheControl(CacheControl.maxAge(86400, TimeUnit.SECONDS).cachePublic()).body(cover.bytes());
    }
}

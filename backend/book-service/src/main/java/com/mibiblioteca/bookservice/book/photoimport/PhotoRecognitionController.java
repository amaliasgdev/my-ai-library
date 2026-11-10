package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

@RestController
@RequestMapping("/api/book-photo-import")
public class PhotoRecognitionController {
    private final PhotoRecognitionService service;

    public PhotoRecognitionController(PhotoRecognitionService service) { this.service = service; }

    @GetMapping("/capabilities")
    @Operation(summary = "Photo recognition availability and processing limits",
        description = "Disabled by default. SIMULATED mode returns fixed examples; REAL mode sends sanitized pixels to OpenAI only on explicit analysis. No credentials are exposed.")
    @ApiResponse(responseCode = "200", description = "Availability, mode and limits; no credentials")
    public Capabilities capabilities() { return service.capabilities(); }

    @PostMapping(value = "/recognize", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Analyze one temporary photo",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
            content = @Content(mediaType = "multipart/form-data", schema = @Schema(implementation = RecognitionRequest.class))),
        description = "Exactly one file and one rotation. JPEG or static PNG, at most 5 MiB (5242880 bytes). EXIF orientation precedes clockwise manual rotation. Pixels are rebuilt without metadata or resizing. Explicit OpenAI mode sends only the rebuilt PNG, store=false (not zero retention), one potentially billable request without tools or retries. No Book creation or image persistence. Cancellation may still incur provider cost.")
    @ApiResponse(responseCode = "200", description = "Validated observations with explicit simulated flag")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "413", description = "Photo exceeds the configured upload size", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "415", description = "Only matching JPEG and static PNG are supported", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "429", description = "Processing capacity, provider rate limit or exhausted quota", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "500", description = "Local photo processing failed", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "502", description = "Invalid, refused or incomplete provider result; incompatible model or request", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "503", description = "Recognition disabled, invalid provider credentials, connection failure or provider unavailable", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(responseCode = "504", description = "PHOTO_TIMEOUT: analysis deadline exceeded; no automatic retry", content = @Content(mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
    public RecognitionResponse recognize(@Parameter(hidden = true) @RequestPart("file") MultipartFile file,
        @Parameter(hidden = true) @RequestParam("rotation") String rotation,
        MultipartHttpServletRequest request) {
        String[] rotations = request.getParameterValues("rotation");
        if (request.getFiles("file").size() != 1) throw PhotoImportException.invalid("Exactly one file is required", "file");
        if (rotations == null || rotations.length != 1 || !rotation.matches("0|90|180|270")) {
            throw PhotoImportException.invalid("Exactly one rotation of 0, 90, 180 or 270 is required", "rotation");
        }
        return service.recognize(file, Integer.parseInt(rotation));
    }
}

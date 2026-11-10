package com.mibiblioteca.bookservice.book.lookup;

import com.mibiblioteca.bookservice.book.lookup.MetadataDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/books")
@Tag(name = "Bibliographic metadata")
public class MetadataController {
    private final MetadataService service;
    private final MetadataDuplicateService duplicates;
    public MetadataController(MetadataService service, MetadataDuplicateService duplicates) { this.service = service; this.duplicates = duplicates; }

    @GetMapping("/metadata-search")
    @Parameter(name = "title", in = ParameterIn.QUERY, schema = @Schema(type = "string", maxLength = 255))
    @Parameter(name = "author", in = ParameterIn.QUERY, schema = @Schema(type = "string", maxLength = 255))
    @Operation(summary = "Search Open Library works by title and/or author", description = "At most 10 works. Text only; no image transfer or persistence. Work firstPublicationYear is not an edition year. No work ISBN is assigned. No automatic retries.")
    @ApiResponse(responseCode = "200", description = "Multiple or empty work results; truncated signals more works")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "502", ref = "#/components/responses/BookProviderBadGateway")
    @ApiResponse(responseCode = "503", ref = "#/components/responses/BookProviderUnavailable")
    @ApiResponse(responseCode = "504", ref = "#/components/responses/BookProviderTimeout")
    public Works search(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        return service.search(scalar(params, "title"), scalar(params, "author"));
    }

    @GetMapping("/metadata-editions")
    @Parameter(name = "workKey", in = ParameterIn.QUERY, required = true, schema = @Schema(type = "string", pattern = "/works/OL[0-9]{1,12}W"))
    @Parameter(name = "page", in = ParameterIn.QUERY, schema = @Schema(type = "integer", minimum = "0", maximum = "9", defaultValue = "0"))
    @Operation(summary = "List editions belonging to an Open Library work", description = "workKey must match /works/OL[0-9]{1,12}W, never a URL. page=0..9, fixed size 10, no arbitrary upstream traversal. Edition metadata and valid ISBNs are separate; no ISBN selected automatically.")
    @ApiResponse(responseCode = "200", description = "Bounded edition page with hasNext")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "502", ref = "#/components/responses/BookProviderBadGateway")
    @ApiResponse(responseCode = "503", ref = "#/components/responses/BookProviderUnavailable")
    @ApiResponse(responseCode = "504", ref = "#/components/responses/BookProviderTimeout")
    public Editions editions(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        String rawPage = scalar(params, "page");
        if (rawPage != null && !rawPage.matches("[0-9]")) throw MetadataService.invalid("page must be 0..9");
        return service.editions(scalar(params, "workKey"), rawPage == null ? 0 : Integer.parseInt(rawPage));
    }

    @GetMapping("/metadata-duplicates")
    @Parameter(name = "isbn", in = ParameterIn.QUERY, schema = @Schema(type = "string", maxLength = 50))
    @Parameter(name = "title", in = ParameterIn.QUERY, schema = @Schema(type = "string", maxLength = 255))
    @Parameter(name = "author", in = ParameterIn.QUERY, schema = @Schema(type = "string", maxLength = 255))
    @Operation(summary = "Read-only advisory catalog duplicate check", description = "Preserves original ISBN evidence; validates checksum and derives ISBN-10/978-ISBN-13 equivalence. Up to 20 exact/equivalent and 20 possible title+author substring matches. Similarity does not prove identity. Failure means unknown, never new. No external call or write.")
    @ApiResponse(responseCode = "200", description = "ISBN validation, equivalence and categorized matches; similarityChecked and truncated indicate limitations")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "500", description = "Catalog query failed; duplicate state is unknown", content = @Content(mediaType = "application/problem+json", schema = @Schema(ref = "#/components/schemas/ProblemDetail")))
    public Duplicates duplicates(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        return duplicates.check(scalar(params, "isbn"), scalar(params, "title"), scalar(params, "author"));
    }

    private String scalar(MultiValueMap<String, String> params, String name) {
        var values = params.get(name);
        if (values == null) return null;
        if (values.size() != 1) throw MetadataService.invalid(name + " must occur once");
        return values.getFirst();
    }
}

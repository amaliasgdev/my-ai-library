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
    @Parameter(name = "language", in = ParameterIn.QUERY, description = "ISO 639-1 preference, or all. Not an exclusion filter.")
    @Parameter(name = "smart", in = ParameterIn.QUERY, schema = @Schema(type = "boolean"), description = "Opt-in: up to four alternatives within one lookup deadline")
    @Operation(summary = "Search Open Library works by title and/or author", description = "At most 10 works. Optional smart=true tries up to four literal/normalized/broader queries within the configured total budget, stopping once a work has an exact whole-title match. language is an ISO 639-1 preference or all, not an exclusion filter. matchKind is EXACT_TEXT (work title), EXACT_EDITION_TITLE (best provider edition title) or APPROXIMATE; it never means identity or probability. resolution is CLEAR only when exactly one work is exact, otherwise AMBIGUOUS (or NONE when empty); clients must not propose a single work or cover for AMBIGUOUS results. Later-query failures after useful matches return them with truncated=true. Text only; no persistence, work ISBN or inferred edition year. Provider errors on the first query are not empty results; no automatic error retries.")
    @ApiResponse(responseCode = "200", description = "Multiple or empty work results; truncated signals more works")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "502", ref = "#/components/responses/BookProviderBadGateway")
    @ApiResponse(responseCode = "503", ref = "#/components/responses/BookProviderUnavailable")
    @ApiResponse(responseCode = "504", ref = "#/components/responses/BookProviderTimeout")
    public Works search(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        String smart = scalar(params, "smart");
        if (smart != null && !smart.equals("true") && !smart.equals("false")) throw MetadataService.invalid("Invalid smart flag");
        if (smart == null && !params.containsKey("language")) return service.search(scalar(params, "title"), scalar(params, "author"));
        return service.search(scalar(params, "title"), scalar(params, "author"), scalar(params, "language"), "true".equals(smart));
    }

    @GetMapping("/metadata-editions")
    @Parameter(name = "workKey", in = ParameterIn.QUERY, required = true, schema = @Schema(type = "string", pattern = "/works/OL[0-9]{1,12}W"))
    @Parameter(name = "page", in = ParameterIn.QUERY, schema = @Schema(type = "integer", minimum = "0", maximum = "9", defaultValue = "0"))
    @Parameter(name = "language", in = ParameterIn.QUERY, description = "Optional edition language filter, ISO 639-1 or all")
    @Parameter(name = "title", in = ParameterIn.QUERY, description = "Optional indexed edition title")
    @Parameter(name = "publisher", in = ParameterIn.QUERY, description = "Optional indexed publisher")
    @Parameter(name = "year", in = ParameterIn.QUERY, description = "Optional edition publication year")
    @Parameter(name = "isbn", in = ParameterIn.QUERY, description = "Optional checksum-valid ISBN")
    @Operation(summary = "List editions belonging to an Open Library work", description = "Without filters: page=0..9, fixed size 10. With language/title/publisher/year/isbn: page 0 only, search the whole work index and hydrate at most one best edition, verified against supplied filters; partial=true, hasNext=false do not imply exhaustive results. At most two provider requests in one deadline. Work keys never accept URLs. Edition metadata and valid ISBNs are separate; no ISBN selected automatically or work first-publication year substituted.")
    @ApiResponse(responseCode = "200", description = "Bounded edition page with hasNext")
    @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequest")
    @ApiResponse(responseCode = "502", ref = "#/components/responses/BookProviderBadGateway")
    @ApiResponse(responseCode = "503", ref = "#/components/responses/BookProviderUnavailable")
    @ApiResponse(responseCode = "504", ref = "#/components/responses/BookProviderTimeout")
    public Editions editions(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        String rawPage = scalar(params, "page");
        if (rawPage != null && !rawPage.matches("[0-9]")) throw MetadataService.invalid("page must be 0..9");
        if (java.util.List.of("language", "title", "publisher", "year", "isbn").stream().anyMatch(params::containsKey)) {
            if (rawPage != null && !rawPage.equals("0")) throw MetadataService.invalid("Filtered editions support page 0 only; results are partial");
            return service.filteredEditions(scalar(params, "workKey"), scalar(params, "language"), scalar(params, "title"),
                scalar(params, "publisher"), scalar(params, "year"), scalar(params, "isbn"));
        }
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

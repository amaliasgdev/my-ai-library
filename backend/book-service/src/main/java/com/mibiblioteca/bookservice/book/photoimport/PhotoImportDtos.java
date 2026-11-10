package com.mibiblioteca.bookservice.book.photoimport;

import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.web.multipart.MultipartFile;

public final class PhotoImportDtos {
    private PhotoImportDtos() { }

    public enum Legibility { CLEAR, PARTIAL, ILLEGIBLE }

    public record RecognitionRequest(
        @Schema(type = "string", format = "binary", requiredMode = Schema.RequiredMode.REQUIRED) MultipartFile file,
        @Schema(allowableValues = {"0", "90", "180", "270"}, requiredMode = Schema.RequiredMode.REQUIRED) String rotation
    ) { }

    public record Capabilities(boolean enabled, String provider, String mode, boolean simulated,
        List<String> allowedFormats, long maxFileBytes, int maxWidth, int maxHeight, long maxPixels,
        int maxObservations, int maxConcurrentAnalyses, long analysisTimeoutMillis) { }

    public record Observation(String id, String visibleText, String title, String author,
        String rawIsbn, Legibility legibility, List<String> warnings) { }

    public record ProviderResult(List<Observation> observations, boolean incomplete, List<String> warnings) { }

    public record RecognitionResponse(String requestId, String provider, boolean simulated,
        List<Observation> observations, boolean incomplete, List<String> warnings) { }
}

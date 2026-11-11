package com.mibiblioteca.bookservice.book.photoimport;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.mibiblioteca.bookservice.book.cover.CoverTestImages;
import com.mibiblioteca.bookservice.common.exception.GlobalExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PhotoRecognitionControllerTest {
    private MockMvc mvc;

    @BeforeEach
    void setup() { mvc = mvc(true); }

    @Test
    void capabilitiesExposeSimulationAndBoundedProcessingLimits() throws Exception {
        mvc.perform(get("/api/book-photo-import/capabilities")).andExpect(status().isOk())
            .andExpect(jsonPath("$.provider").value("mock"))
            .andExpect(jsonPath("$.mode").value("SIMULATED"))
            .andExpect(jsonPath("$.simulated").value(true))
            .andExpect(jsonPath("$.allowedFormats[0]").value("image/jpeg"))
            .andExpect(jsonPath("$.maxFileBytes").value(5242880))
            .andExpect(jsonPath("$.maxObservations").value(25))
            .andExpect(jsonPath("$.maxConcurrentAnalyses").value(1));
    }

    @Test
    void disabledModeDoesNotAnalyze() throws Exception {
        mvc(false).perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).param("rotation", "0"))
            .andExpect(status().isServiceUnavailable()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.code").value("PHOTO_DISABLED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "90", "180", "270"})
    void multipartReturnsExplicitlySimulatedResultWithoutCreatingBooks(String rotation) throws Exception {
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).param("rotation", rotation))
            .andExpect(status().isOk()).andExpect(jsonPath("$.requestId").isNotEmpty())
            .andExpect(jsonPath("$.provider").value("mock")).andExpect(jsonPath("$.simulated").value(true))
            .andExpect(jsonPath("$.observations[0].title").value("Dune"))
            .andExpect(jsonPath("$.observations[0].rawIsbn").isEmpty())
            .andExpect(jsonPath("$.observations[0].confidence").doesNotExist())
            .andExpect(jsonPath("$.observations[0].legibility").value("CLEAR"));
    }

    @Test
    void requiresOneFileAndOneStrictRotation() throws Exception {
        mvc.perform(multipart("/api/book-photo-import/recognize").param("rotation", "0"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.file").exists());
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.rotation").exists());
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).file(CoverTestImages.png()).param("rotation", "0"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.file").exists());
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).param("rotation", "0", "90"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.rotation").exists());
    }

    @ParameterizedTest
    @ValueSource(strings = {"-90", "360", "45", "90.0", " 90", "", "090"})
    void rejectsNonCanonicalRotation(String rotation) throws Exception {
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).param("rotation", rotation))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.rotation").exists());
    }

    @Test
    void malformedAndOversizedImagesUseProblemDetails() throws Exception {
        mvc.perform(multipart("/api/book-photo-import/recognize")
            .file(new MockMultipartFile("file", "private.jpg", "image/jpeg", new byte[] {1, 2})).param("rotation", "0"))
            .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.errors.file").exists());
        mvc.perform(multipart("/api/book-photo-import/recognize")
            .file(new MockMultipartFile("file", "private.jpg", "image/jpeg", new byte[5242881])).param("rotation", "0"))
            .andExpect(status().isPayloadTooLarge());
    }

    private MockMvc mvc(boolean enabled) {
        var properties = PhotoTestSupport.properties(enabled);
        var service = new PhotoRecognitionService(properties, new PhotoSanitizer(properties),
            List.of(new MockBookPhotoRecognitionProvider()), PhotoTestSupport.environment("test"));
        return MockMvcBuilders.standaloneSetup(new PhotoRecognitionController(service)).setControllerAdvice(new GlobalExceptionHandler()).build();
    }
}

package com.mibiblioteca.bookservice.book.lookup;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.mibiblioteca.bookservice.common.exception.GlobalExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MetadataControllerTest {
    private final MetadataService service = mock(MetadataService.class);
    private final MetadataDuplicateService duplicates = mock(MetadataDuplicateService.class);
    private final org.springframework.test.web.servlet.MockMvc mvc = MockMvcBuilders.standaloneSetup(new MetadataController(service, duplicates))
        .setControllerAdvice(new GlobalExceptionHandler()).build();

    @Test
    void exposesReadOnlyMetadataAndDuplicates() throws Exception {
        when(service.search("Dune", "Herbert")).thenReturn(new MetadataDtos.Works(List.of(), false));
        mvc.perform(get("/api/books/metadata-search").param("title", "Dune").param("author", "Herbert"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        when(service.editions("/works/OL1W", 0)).thenReturn(new MetadataDtos.Editions("/works/OL1W", 0, List.of(), false));
        mvc.perform(get("/api/books/metadata-editions").param("workKey", "/works/OL1W"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void repeatedParametersAndInvalidPagesAreRejectedBeforeService() throws Exception {
        mvc.perform(get("/api/books/metadata-search").param("title", "a", "b")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-editions").param("page", "10")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-duplicates").param("isbn", "a", "b")).andExpect(status().isBadRequest());
        verifyNoInteractions(service, duplicates);
    }

    @Test
    void supportsOptionalSmartPreferenceAndGlobalEditionFilters() throws Exception {
        when(service.search("Title", "Author", "es", true)).thenReturn(new MetadataDtos.Works(List.of(), false));
        mvc.perform(get("/api/books/metadata-search").param("title", "Title").param("author", "Author").param("smart", "true").param("language", "es"))
            .andExpect(status().isOk());
        verify(service).search("Title", "Author", "es", true);
        when(service.filteredEditions("/works/OL1W", "es", null, "Pub", null, null))
            .thenReturn(new MetadataDtos.Editions("/works/OL1W", 0, List.of(), false, true));
        mvc.perform(get("/api/books/metadata-editions").param("workKey", "/works/OL1W").param("language", "es").param("publisher", "Pub"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.partial").value(true));
    }

    @Test
    void rejectsRepeatedNewScalarsAndFilteredPagination() throws Exception {
        mvc.perform(get("/api/books/metadata-search").param("smart", "true", "false")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-search").param("smart", "yes")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-search").param("language", "es", "en")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-editions").param("language", "es").param("page", "1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/books/metadata-editions").param("title", "a", "b")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void safeProviderErrorsPropagateRetryAfterAndNeverRetry() throws Exception {
        when(service.search(any(), any())).thenThrow(new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE,
            "Book provider unavailable", "External book provider is temporarily rate limited", "60"));
        mvc.perform(get("/api/books/metadata-search").param("title", "Dune"))
            .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After", "60"))
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        verify(service).search("Dune", null);
        verifyNoMoreInteractions(service);
    }
}

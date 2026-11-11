package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MetadataSmartSearchTest {
    private final OpenLibraryClient client = mock(OpenLibraryClient.class);
    private final ObjectMapper json = new ObjectMapper();
    private final MetadataService service = new MetadataService(client, new OpenLibraryMapper(OpenLibraryMapperTest.properties()),
        OpenLibraryMapperTest.properties(), new IsbnEquivalents(new IsbnNormalizer(), new LookupIsbnValidator()));

    @Test
    void translatedTitleUsesBoundedLiteralAlternativesAndSameBudget() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(json.readTree("{\"docs\":[]}"));
        when(client.metadataSearch(eq("harry potter"), isNull(), eq("es"), any())).thenReturn(json.readTree("""
            {"num_found":20,"docs":[{"key":"OL1W","title":"Harry Potter and the Philosopher's Stone","author_name":["J. K. Rowling"]},
            {"key":"/works/OL1W","title":"Duplicate"}]}
            """));
        var result = service.search("Harry Potter y la piedra filosofal", "J.K. Rowling", "es", true);
        assertThat(result.content()).hasSize(1);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL1W");
        assertThat(result.content().getFirst().matchKind()).isEqualTo("APPROXIMATE");
        assertThat(result.truncated()).isTrue();
        var budget = org.mockito.ArgumentCaptor.forClass(LookupBudget.class);
        verify(client, times(4)).metadataSearch(any(), any(), eq("es"), budget.capture());
        assertThat(budget.getAllValues()).allMatch(b -> b == budget.getValue());
        verify(client).metadataSearch(eq("harry potter y la piedra filosofal"), eq("rowling"), eq("es"), any());
    }

    @Test
    void exactTextRankedAheadAndNoFurtherRequests() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(json.readTree("""
            {"docs":[{"key":"OL2W","title":"Dune Messiah","author_name":["Frank Herbert"]},
            {"key":"OL1W","title":"Dune","author_name":["Frank Herbert"]}]}
            """));
        var result = service.search("Dune", "Frank Herbert", "all", true);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL1W");
        assertThat(result.content().getFirst().matchKind()).isEqualTo("EXACT_TEXT");
        verify(client, times(1)).metadataSearch(any(), any(), isNull(), any());
    }

    @Test
    void absenceIsNotProviderErrorAndNoRetryAfterError() {
        var unavailable = new BookLookupException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "Provider", "Limited", "10");
        when(client.metadataSearch(any(), any(), any(), any())).thenThrow(unavailable);
        assertThatThrownBy(() -> service.search("Dune", "Herbert", "es", true)).isSameAs(unavailable);
        verify(client, times(1)).metadataSearch(any(), any(), any(), any());
    }

    @Test
    void alternativesAreDeduplicatedAndNeverTranslate() {
        assertThat(MetadataSearchStrategy.queries("Dune", "Herbert")).hasSize(3);
        assertThat(MetadataSearchStrategy.queries("Título", null)).hasSize(2);
        assertThat(MetadataSearchStrategy.normalize("  J.K.  Rowling ")).isEqualTo("j k rowling");
        assertThat(MetadataSearchStrategy.queries("Harry Potter y la piedra filosofal", "Rowling").toString())
            .doesNotContain("Philosopher").contains("harry potter");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ES", "spa", "", "xx", "es OR *"})
    void invalidPreferenceNeverCallsProvider(String language) {
        assertThatThrownBy(() -> service.search("Dune", null, language, true)).isInstanceOf(BookLookupException.class);
        verifyNoInteractions(client);
    }

    @Test
    void indexedEditionOutsideFirstPageIsHydratedAndVerified() throws Exception {
        when(client.filteredEdition(eq("/works/OL1W"), anyString(), eq("es"), any())).thenReturn(json.readTree("""
            {"docs":[{"key":"/works/OL1W","editions":{"numFound":400,"docs":[{"key":"/books/OL999M"}]}}]}
            """));
        when(client.metadataEdition(eq("/books/OL999M"), any())).thenReturn(json.readTree("""
            {"key":"/books/OL999M","works":[{"key":"/works/OL1W"}],"title":"Piedra filosofal",
            "publish_date":"2001","publishers":["Salamandra"],"languages":[{"key":"/languages/spa"}],"isbn_13":["9780132350884"]}
            """));
        var result = service.filteredEditions("/works/OL1W", "es", " Piedra ", " Salamandra ", " 2001 ", "0132350882");
        assertThat(result.content()).hasSize(1);
        assertThat(result.content().getFirst().metadata().language()).isEqualTo("es");
        assertThat(result.content().getFirst().metadata().isbn()).isNull();
        assertThat(result.hasNext()).isFalse();
        verify(client).filteredEdition(eq("/works/OL1W"), contains("language:spa"), eq("es"), any());
        verify(client, never()).metadataEditions(any(), anyInt(), any());
    }

    @Test
    void indexHitDoesNotProveLanguageOrYearOfEdition() throws Exception {
        when(client.filteredEdition(any(), any(), any(), any())).thenReturn(json.readTree("""
            {"docs":[{"key":"OL1W","editions":{"docs":[{"key":"/books/OL1M"}]}}]}
            """));
        when(client.metadataEdition(any(), any())).thenReturn(json.readTree("""
            {"key":"/books/OL1M","title":"Title","first_publish_year":2001,"languages":[{"key":"/languages/eng"}]}
            """));
        assertThat(service.filteredEditions("/works/OL1W", "es", null, null, "2001", null).content()).isEmpty();
    }

    @Test
    void invalidFiltersAreRejectedBeforeAnyRequest() {
        assertThatThrownBy(() -> service.filteredEditions("/works/OL1W", "es", null, null, "0", null)).isInstanceOf(BookLookupException.class);
        assertThatThrownBy(() -> service.filteredEditions("/works/OL1W", "es", null, null, null, "invalid")).isInstanceOf(BookLookupException.class);
        verifyNoInteractions(client);
    }
}

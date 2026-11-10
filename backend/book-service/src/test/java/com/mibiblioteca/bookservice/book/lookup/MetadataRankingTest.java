package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.lookup.MetadataDtos.Work;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** Offline fixtures shaped like Open Library search.json responses; no provider is contacted. */
class MetadataRankingTest {
    private static final String RECOGNIZED_AUTHOR = "J.K. Rowling";
    private final OpenLibraryClient client = mock(OpenLibraryClient.class);
    private final ObjectMapper json = new ObjectMapper();
    private final MetadataService service = new MetadataService(client, new OpenLibraryMapper(OpenLibraryMapperTest.properties()),
        OpenLibraryMapperTest.properties(), new IsbnEquivalents(new IsbnNormalizer(), new LookupIsbnValidator()));

    private String doc(String key, String title, String author, String editionTitle) {
        String editions = editionTitle == null ? "" : ",\"editions\":{\"numFound\":400,\"docs\":[{\"key\":\"/books/OL1M\",\"title\":\""
            + editionTitle + "\"}]}";
        return "{\"key\":\"" + key + "\",\"title\":\"" + title + "\",\"author_name\":[\"" + author + "\"],\"cover_i\":"
            + Math.abs(key.hashCode()) % 100000 + 1 + editions + "}";
    }

    private JsonNode response(String... docs) throws Exception {
        return json.readTree("{\"numFound\":" + docs.length + ",\"docs\":[" + String.join(",", docs) + "]}");
    }

    private JsonNode saga(boolean withEditionTitles) throws Exception {
        return response(
            doc("/works/OL82563W", "Harry Potter and the Philosopher's Stone", "J. K. Rowling",
                withEditionTitles ? "Harry Potter y la piedra filosofal" : null),
            doc("/works/OL82538W", "Harry Potter and the Deathly Hallows", "J. K. Rowling",
                withEditionTitles ? "Harry Potter y las reliquias de la muerte" : null),
            doc("/works/OL82537W", "Harry Potter and the Chamber of Secrets", "J. K. Rowling",
                withEditionTitles ? "Harry Potter y la cámara secreta" : null));
    }

    @Test
    void chamberOfSecretsIsFirstWhenAnEditionTitleMatchesTheWholeRecognizedTitle() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(saga(true));
        var result = service.search("Harry Potter y la cámara secreta", RECOGNIZED_AUTHOR, "es", true);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL82537W");
        assertThat(result.content().getFirst().matchKind()).isEqualTo("EXACT_EDITION_TITLE");
        assertThat(result.content().getFirst().matchedEditionTitle()).isEqualTo("Harry Potter y la cámara secreta");
        assertThat(result.content().getFirst().title()).isEqualTo("Harry Potter and the Chamber of Secrets");
        assertThat(result.content().stream().skip(1)).extracting(Work::matchKind).containsOnly("APPROXIMATE");
        assertThat(result.resolution()).isEqualTo("CLEAR");
        verify(client, times(1)).metadataSearch(any(), any(), any(), any());
    }

    @Test
    void theOtherTitleOfTheSameSagaResolvesToItsOwnWork() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(saga(true));
        var result = service.search("Harry Potter y la piedra filosofal", RECOGNIZED_AUTHOR, "es", true);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL82563W");
        assertThat(result.resolution()).isEqualTo("CLEAR");
    }

    @Test
    void translatedTitleWithoutBibliographicEvidenceStaysAmbiguousAndNeverPicksTheFirstWork() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(saga(false));
        var result = service.search("Harry Potter y la cámara secreta", RECOGNIZED_AUTHOR, "es", true);
        assertThat(result.content()).hasSize(3);
        assertThat(result.content()).extracting(Work::matchKind).containsOnly("APPROXIMATE");
        assertThat(result.resolution()).isEqualTo("AMBIGUOUS");
        verify(client, times(4)).metadataSearch(any(), any(), any(), any());
    }

    @Test
    void fullTitleBeatsAPartialSagaMatchEvenWhenTheProviderListsItLast() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response(
            doc("/works/OL1W", "Harry Potter", "J. K. Rowling", null),
            doc("/works/OL2W", "Harry Potter and the Deathly Hallows", "J. K. Rowling", null),
            doc("/works/OL82537W", "Harry Potter and the Chamber of Secrets", "J. K. Rowling", null)));
        var result = service.search("Harry Potter and the Chamber of Secrets", RECOGNIZED_AUTHOR, "all", true);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL82537W");
        assertThat(result.content().getFirst().matchKind()).isEqualTo("EXACT_TEXT");
        assertThat(result.resolution()).isEqualTo("CLEAR");
    }

    @Test
    void partialSimilarityOrdersCandidatesWithoutDeclaringAnyOfThemCorrect() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response(
            doc("/works/OL1W", "Harry Potter and the Deathly Hallows", "J. K. Rowling", null),
            doc("/works/OL2W", "Harry Potter and the Chamber", "J. K. Rowling", null)));
        var result = service.search("Harry Potter and the Chamber of Secrets", RECOGNIZED_AUTHOR, "all", true);
        assertThat(result.content().getFirst().workKey()).isEqualTo("/works/OL2W");
        assertThat(result.content()).extracting(Work::matchKind).containsOnly("APPROXIMATE");
        assertThat(result.resolution()).isEqualTo("AMBIGUOUS");
    }

    @Test
    void identicalTitleByAnIncompatibleAuthorIsNotExact() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response(
            doc("/works/OL9W", "Harry Potter y la cámara secreta", "Another Writer", null)));
        var result = service.search("Harry Potter y la cámara secreta", RECOGNIZED_AUTHOR, "es", true);
        assertThat(result.content().getFirst().matchKind()).isEqualTo("APPROXIMATE");
        assertThat(result.resolution()).isEqualTo("AMBIGUOUS");
    }

    @Test
    void twoExactCandidatesAreAmbiguousRatherThanArbitrarilyResolved() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response(
            doc("/works/OL1W", "Dune", "Frank Herbert", null), doc("/works/OL2W", "Dune", "Frank Herbert", null)));
        var result = service.search("Dune", "Frank Herbert", "all", true);
        assertThat(result.content()).extracting(Work::matchKind).containsOnly("EXACT_TEXT");
        assertThat(result.resolution()).isEqualTo("AMBIGUOUS");
    }

    @Test
    void accentsPunctuationAndSpacingDoNotPreventAnExactEditionTitle() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response(
            doc("/works/OL82537W", "Harry Potter and the Chamber of Secrets", "J. K. Rowling", "HARRY  POTTER Y LA CAMARA SECRETA!")));
        var result = service.search("Harry Potter y la cámara secreta", "J. K. Rowling", "es", true);
        assertThat(result.content().getFirst().matchKind()).isEqualTo("EXACT_EDITION_TITLE");
    }

    @Test
    void failureAfterUsefulMatchesKeepsThemButFlagsIncompleteResults() throws Exception {
        var unavailable = new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Provider", "Limited", "30");
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(saga(false)).thenThrow(unavailable);
        var result = service.search("Harry Potter y la cámara secreta", RECOGNIZED_AUTHOR, "es", true);
        assertThat(result.content()).hasSize(3);
        assertThat(result.truncated()).isTrue();
        assertThat(result.resolution()).isEqualTo("AMBIGUOUS");
        verify(client, times(2)).metadataSearch(any(), any(), any(), any());
    }

    @Test
    void absenceIsNoneAndLegacyCallsAreNotAssessed() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(response());
        assertThat(service.search("Unknown", null, "es", true).resolution()).isEqualTo("NONE");
        when(client.metadataSearch(eq("Dune"), eq("Herbert"), any())).thenReturn(response(doc("/works/OL1W", "Dune", "Frank Herbert", null)));
        var legacy = service.search("Dune", "Herbert");
        assertThat(legacy.resolution()).isNull();
        assertThat(legacy.content().getFirst().matchKind()).isEqualTo("UNASSESSED");
    }

    @Test
    void editionTitleIsEvidenceOnlyAndMalformedEditionEntriesAreIgnored() throws Exception {
        when(client.metadataSearch(any(), any(), any(), any())).thenReturn(json.readTree("""
            {"docs":[{"key":"OL5W","title":"Original","author_name":["A B"],
              "editions":{"docs":[{"key":"https://evil/books/OL1M","title":"Spoof"},{"key":"/books/OL2M","title":7}]}}]}
            """));
        var result = service.search("Spoof", "A B", "all", true);
        assertThat(result.content().getFirst().title()).isEqualTo("Original");
        assertThat(result.content().getFirst().matchedEditionTitle()).isNull();
        assertThat(result.content().getFirst().matchKind()).isEqualTo("APPROXIMATE");
    }

    @Test
    void helpersAreWholeTokenAndAccentInsensitiveWithoutSubstringMatches() {
        assertThat(MetadataSearchStrategy.normalize("¡Cámara  Secreta, Ñandú!")).isEqualTo("camara secreta nandu");
        assertThat(MetadataSearchStrategy.sameTitle("CAMARA secreta", "Cámara secreta.")).isTrue();
        assertThat(MetadataSearchStrategy.sameTitle(null, "x")).isFalse();
        assertThat(MetadataSearchStrategy.similarity("potter", "potters")).isZero();
        assertThat(MetadataSearchStrategy.similarity("harry potter", "harry potter")).isEqualTo(1.0);
        assertThat(MetadataSearchStrategy.similarity("harry potter y la piedra filosofal", "harry potter and the philosopher s stone"))
            .isLessThan(0.5);
        assertThat(MetadataSearchStrategy.sameAuthor(List.of("J. K. Rowling"), "J.K. Rowling")).isTrue();
        assertThat(MetadataSearchStrategy.sameAuthor(List.of("Joanne Rowling"), "Rowling")).isTrue();
        assertThat(MetadataSearchStrategy.sameAuthor(List.of("Frank Herbert"), "J.K. Rowling")).isFalse();
        assertThat(MetadataSearchStrategy.sameAuthor(List.of(), "Rowling")).isFalse();
    }
}

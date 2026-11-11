package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MetadataServiceTest {
    private final OpenLibraryClient client = mock(OpenLibraryClient.class);
    private final ObjectMapper json = new ObjectMapper();
    private final IsbnEquivalents equivalents = new IsbnEquivalents(new IsbnNormalizer(), new LookupIsbnValidator());
    private final MetadataService service = new MetadataService(client, new OpenLibraryMapper(OpenLibraryMapperTest.properties()),
        OpenLibraryMapperTest.properties(), equivalents);

    @Test
    void multipleWorksHaveNoEditionIsbnAndFirstYearIsExplicit() throws Exception {
        when(client.metadataSearch(eq("Dune"), eq("Herbert"), any())).thenReturn(json.readTree("""
            {"numFound":30,"docs":[
            {"key":"/works/OL1W","title":"Dune","author_name":["Frank Herbert"],"first_publish_year":1965,"cover_i":123,"edition_count":4,"isbn":["9780132350884"]},
            {"key":"/works/OL2W","title":"Dune Messiah"},
            {"key":"https://evil/works/OL3W","title":"Bad"}]}
            """));
        var result = service.search(" Dune ", "Herbert");
        assertThat(result.content()).hasSize(2);
        assertThat(result.truncated()).isTrue();
        assertThat(result.content().getFirst().firstPublicationYear()).isEqualTo(1965);
        assertThat(result.content().getFirst().coverUrl()).startsWith("https://covers.openlibrary.org/b/id/123-");
        assertThat(json.writeValueAsString(result)).doesNotContain("isbn");
    }

    @Test
    void acceptsTitleOrAuthorAndEmptyResults() throws Exception {
        when(client.metadataSearch(any(), any(), any())).thenReturn(json.readTree("{\"docs\":[],\"numFound\":0}"));
        assertThat(service.search("Title", null).content()).isEmpty();
        assertThat(service.search(null, "Author").content()).isEmpty();
    }

    @Test
    void editionsRemainDistinctAndNeverUseWorkYearOrFirstIsbn() throws Exception {
        when(client.metadataEditions(eq("/works/OL1W"), eq(0), any())).thenReturn(json.readTree("""
            {"size":21,"entries":[
              {"key":"/books/OL1M","title":"Dune","publish_date":"2001","first_publish_year":1965,"isbn_13":["9780132350884","9780132350885"],"publishers":["Pub"]},
              {"key":"/books/OL2M","title":"Dune","first_publish_year":1965,"isbn_10":["0132350882"]},
              {"key":"/books/OL3M","works":[{"key":"/works/OL2W"}]}
            ]}
            """));
        var result = service.editions("/works/OL1W", 0);
        assertThat(result.content()).hasSize(2);
        assertThat(result.hasNext()).isTrue();
        assertThat(result.content().getFirst().isbns()).containsExactly("9780132350884");
        assertThat(result.content().getFirst().metadata().isbn()).isNull();
        assertThat(result.content().getFirst().metadata().publicationYear()).isEqualTo(2001);
        assertThat(result.content().get(1).metadata().publicationYear()).isNull();
        assertThat(result.content().get(1).isbns()).containsExactly("0132350882");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "line\nfeed", "tab\t", "bad\u2028line"})
    void rejectsInvalidTextBeforeUpstream(String input) {
        assertThatThrownBy(() -> service.search(input, null)).isInstanceOf(BookLookupException.class);
        verifyNoInteractions(client);
    }

    @Test
    void rejectsEmptyOverlongAndInvalidWorkAndPage() {
        assertThatThrownBy(() -> service.search(null, null)).isInstanceOf(BookLookupException.class);
        assertThatThrownBy(() -> service.search("a".repeat(256), null)).isInstanceOf(BookLookupException.class);
        for (String key : new String[] {"https://openlibrary.org/works/OL1W", "/works/OL1W/../x", "OL1W", "/books/OL1M", "/works/OL1234567890123W"}) {
            assertThatThrownBy(() -> service.editions(key, 0)).isInstanceOf(BookLookupException.class);
        }
        assertThatThrownBy(() -> service.editions("/works/OL1W", 10)).isInstanceOf(BookLookupException.class);
        verifyNoInteractions(client);
    }

    @Test
    void invalidResponseFailsRatherThanPretendingEmpty() throws Exception {
        when(client.metadataSearch(any(), any(), any())).thenReturn(json.readTree("{\"docs\":null}"));
        assertThatThrownBy(() -> service.search("Title", null)).isInstanceOfSatisfying(BookLookupException.class, ex -> assertThat(ex.status().value()).isEqualTo(502));
        when(client.metadataEditions(any(), anyInt(), any())).thenReturn(json.readTree("{\"entries\":null}"));
        assertThatThrownBy(() -> service.editions("/works/OL1W", 0)).isInstanceOf(BookLookupException.class);
    }

    @Test
    void isbnEquivalenceUsesChecksumAndNeverRepairsDigits() {
        assertThat(equivalents.valid("0-13-235088-2")).containsExactly("0132350882", "9780132350884");
        assertThat(equivalents.valid("9780132350884")).containsExactly("9780132350884", "0132350882");
        assertThat(equivalents.valid("080442957X")).containsExactly("080442957X", "9780804429573");
        assertThat(equivalents.valid("9791090636071")).containsExactly("9791090636071");
        for (String raw : new String[] {"9780132350885", "0132350883", "letters", "９780132350884"}) assertThat(equivalents.valid(raw)).isEmpty();
    }
}

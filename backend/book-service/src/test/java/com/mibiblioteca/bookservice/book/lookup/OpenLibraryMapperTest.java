package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class OpenLibraryMapperTest {
    private final ObjectMapper json = new ObjectMapper();
    private final OpenLibraryMapper mapper = new OpenLibraryMapper(properties());

    static OpenLibraryProperties properties() {
        return new OpenLibraryProperties(URI.create("https://openlibrary.org"), URI.create("https://covers.openlibrary.org"),
            Duration.ofSeconds(1), Duration.ofSeconds(3), Duration.ofSeconds(8), "MyAILibrary", "");
    }

    @Test
    void shouldMapCompleteEditionAndAuthors() throws Exception {
        var result = mapper.map("9780132350884", json.readTree("""
            {"key":"/books/OL1M","title":" Clean Code ","authors":[{"name":" Author One "},{"name":"author one"},{"name":"Author Two"}],
             "publishers":[null,"", " Publisher "],"publish_date":"2008-08-01","number_of_pages":480,
             "languages":[{"key":"/languages/eng"}],"subjects":[" Software ","software","Design"],"covers":[-1,123]}
            """), null);
        assertThat(result.isbn()).isEqualTo("9780132350884");
        assertThat(result.title()).isEqualTo("Clean Code");
        assertThat(result.author()).isEqualTo("Author One; Author Two");
        assertThat(result.publisher()).isEqualTo("Publisher");
        assertThat(result.publicationYear()).isEqualTo(2008);
        assertThat(result.pageCount()).isEqualTo(480);
        assertThat(result.language()).isEqualTo("en");
        assertThat(result.genres()).containsExactly("Software", "Design");
        assertThat(result.coverUrl()).isEqualTo("https://covers.openlibrary.org/b/id/123-L.jpg?default=false");
    }

    @Test
    void shouldReturnPartialMetadataAndDiscardWrongOptionalTypes() throws Exception {
        var result = mapper.map("9780132350884", json.readTree("""
            {"key":"/books/OL1M","title":{},"authors":[null,3],"publishers":[],"number_of_pages":1.5,
             "languages":["zzz"],"publish_date":"circa 1950","subjects":[null,"", "  "]}
            """), null);
        assertThat(result.title()).isNull();
        assertThat(result.author()).isNull();
        assertThat(result.publisher()).isNull();
        assertThat(result.pageCount()).isNull();
        assertThat(result.language()).isNull();
        assertThat(result.publicationYear()).isNull();
        assertThat(result.genres()).isEmpty();
        assertThat(result.coverUrl()).isNull();
    }

    @ParameterizedTest
    @CsvSource(value = {"es,es", "ES,es", "eng,en", "fre,fr", "ger,de", "zzz,NULL", "es-ES,NULL"}, nullValues = "NULL")
    void shouldMapLanguages(String code, String expected) throws Exception {
        var root = json.createObjectNode();
        root.putArray("languages").add(code);
        assertThat(mapper.map("isbn", root, null).language()).isEqualTo(expected);
    }

    @Test
    void shouldNotGuessAmbiguousLanguage() throws Exception {
        assertThat(mapper.map("isbn", json.readTree("{\"languages\":[\"eng\",\"fre\"]}"), null).language()).isNull();
    }

    @ParameterizedTest
    @CsvSource(value = {"2001,2001", "2001-02-03,2001", "2001-02,2001", "'May 6, 2001',2001", "circa 1950,NULL", "1950-1951,NULL", "2001-02-30,NULL", "0,NULL", "2101,NULL", "edition 2001,NULL"}, nullValues = "NULL")
    void shouldParseOnlySafePublicationDates(String date, Integer expected) {
        var root = json.createObjectNode().put("publish_date", date).put("first_publish_year", 1950);
        assertThat(mapper.map("isbn", root, null).publicationYear()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.5", "2147483648", "\"100\"", "{}", "null"})
    void shouldDiscardInvalidPageCounts(String pages) throws Exception {
        assertThat(mapper.map("isbn", json.readTree("{\"number_of_pages\":" + pages + "}"), null).pageCount()).isNull();
    }

    @Test
    void shouldKeepCompleteAuthorNamesWithinLimit() {
        var root = json.createObjectNode();
        root.putArray("authors").add("a".repeat(250)).add("Name Cannot Fit").add("B");
        assertThat(mapper.map("isbn", root, null).author()).isEqualTo("a".repeat(250) + "; B");
    }

    @Test
    void shouldDiscardLongValuesAndLimitGenres() {
        var root = json.createObjectNode().put("title", "a".repeat(256));
        root.putArray("publishers").add("a".repeat(256)).add("Valid Publisher");
        var subjects = root.putArray("subjects").addNull().add(" ").add("a".repeat(51)).add(" First ").add("first");
        for (int i = 0; i < 15; i++) { subjects.add("Genre " + i); }
        var result = mapper.map("isbn", root, null);
        assertThat(result.title()).isNull();
        assertThat(result.publisher()).isEqualTo("Valid Publisher");
        assertThat(result.genres()).hasSize(10).startsWith("First", "Genre 0").endsWith("Genre 8");
    }

    @Test
    void shouldEnrichOnlyMatchingWorkWithoutReplacingEditionMetadata() throws Exception {
        JsonNode edition = json.readTree("{\"key\":\"/books/OL1M\",\"works\":[{\"key\":\"/works/OL1W\"}],\"publish_date\":\"2001\"}");
        JsonNode search = json.readTree("""
            {"docs":[{"key":"/works/OL2W","author_name":["Wrong"]},
             {"key":"OL1W","author_name":["Correct","Second"],"subject":["History"],"first_publish_year":1800}]}
            """);
        assertThat(mapper.needsEnrichment(edition)).isTrue();
        var result = mapper.map("isbn", edition, search);
        assertThat(result.author()).isEqualTo("Correct; Second");
        assertThat(result.genres()).containsExactly("History");
        assertThat(result.publicationYear()).isEqualTo(2001);
        assertThat(mapper.map("isbn", edition, json.readTree("{\"docs\":[{\"key\":\"OL2W\",\"author_name\":[\"Wrong\"]}]}")).author()).isNull();
    }

    @ParameterizedTest
    @CsvSource(value = {"https://example.com/cover,https://example.com/cover", "http://example.com/cover,http://example.com/cover", "ftp://example.com/cover,NULL", "' https://example.com/cover ',NULL"}, nullValues = "NULL")
    void shouldValidateOfferedCoverUrl(String value, String expected) {
        assertThat(mapper.map("isbn", json.createObjectNode().put("cover_url", value), null).coverUrl()).isEqualTo(expected);
    }

    @Test
    void shouldDiscardOverlongCoverAndInvalidIdentifiers() {
        var root = json.createObjectNode().put("cover_url", "https://example.com/" + "a".repeat(2048));
        root.putArray("covers").add(-1).add(0).add(1.5).add("123");
        assertThat(mapper.map("isbn", root, null).coverUrl()).isNull();
    }
}

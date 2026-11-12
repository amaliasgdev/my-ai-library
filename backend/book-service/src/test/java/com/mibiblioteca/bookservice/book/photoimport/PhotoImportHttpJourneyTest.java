package com.mibiblioteca.bookservice.book.photoimport;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.cover.CoverTestImages;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.readinglist.ReadingListService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/** Real HTTP and database commits; all recognition and bibliographic transport is in-memory. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "server.address=127.0.0.1", "photo-import.enabled=true", "photo-import.provider=mock",
    "external.books.open-library.base-url=https://offline.invalid",
    "spring.datasource.hikari.maximum-pool-size=2", "spring.datasource.hikari.minimum-idle=0"})
@ActiveProfiles("test")
@Import(PhotoImportOfflineApplication.Fixtures.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PhotoImportHttpJourneyTest {
    @LocalServerPort private int port;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookService books;
    @Autowired private ReadingListService lists;
    private final List<Long> created = new ArrayList<>();
    private String baseline;
    private long originalCount;
    private HttpClient http;

    @BeforeEach
    void isolatedBaseline() throws Exception {
        assertThat(jdbc.queryForObject("SELECT current_database()", String.class)).isEqualTo("bookdb_tests");
        assertThat(jdbc.queryForObject("SELECT current_user", String.class)).isEqualTo("booktest");
        baseline = json.writeValueAsString(lists.getList(null));
        originalCount = jdbc.queryForObject("SELECT count(*) FROM public.book", Long.class);
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    @AfterEach
    void cleanOnlyOurFixtures() throws Exception {
        if (http != null) http.close();
        for (long id : created) books.delete(id);
        if (baseline != null) {
            var before = json.readTree(baseline);
            assertThat(json.valueToTree(lists.getList(null)).path("items")).isEqualTo(before.path("items"));
            jdbc.update("UPDATE public.reading_list SET revision=? WHERE id=1", Long.parseLong(before.path("revision").asText()));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM public.book", Long.class)).isEqualTo(originalCount);
        }
    }

    @Test
    void recognizesResolvesReviewsImportsChecksDuplicatesAndPersistsOptionalReadingList() throws Exception {
        assertThat(get("/api/book-photo-import/capabilities").path("mode").asText()).isEqualTo("SIMULATED");
        var result = recognize();
        assertThat(result.path("observations")).hasSize(2);
        assertThat(result.path("simulated").asBoolean()).isTrue();
        assertThat(result.path("incomplete").asBoolean()).isTrue();
        // Analysis alone has no persistence side effects.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.book", Long.class)).isEqualTo(originalCount);
        assertThat(json.writeValueAsString(lists.getList(null))).isEqualTo(baseline);

        var works = get("/api/books/metadata-search?title=Dune&author=Frank%20Herbert");
        assertThat(works.path("content").get(0).path("workKey").asText()).isEqualTo("/works/OL100W");
        var editions = get("/api/books/metadata-editions?workKey=%2Fworks%2FOL100W&page=0");
        assertThat(editions.path("content").get(0).path("isbns").get(0).asText()).isEqualTo("9780441172719");
        var lookup = get("/api/books/isbn-lookup?isbn=9780441172719");
        assertThat(lookup.path("title").asText()).isEqualTo("Dune");
        assertThat(lookup.path("author").asText()).isEqualTo("Frank Herbert");
        assertThat(lookup.path("coverUrl").isNull()).isTrue();

        // Explicit reviewed requests: fixture-only unique names and nullable ISBN,
        // never blindly import the demonstration's real ISBN into an existing catalog.
        String suffix = UUID.randomUUID().toString();
        String firstTitle = "Stage7-" + suffix + "-Dune";
        var duplicateBefore = get("/api/books/metadata-duplicates?title=" + firstTitle + "&author=OfflineReviewer");
        assertThat(duplicateBefore.path("matches")).isEmpty();
        long first = create(firstTitle);
        long second = create("Stage7-" + suffix + "-Foundation");
        assertThat(get("/api/books/metadata-duplicates?title=" + firstTitle + "&author=OfflineReviewer").path("matches"))
            .anySatisfy(match -> assertThat(match.path("id").asLong()).isEqualTo(first));

        var membership = get("/api/reading-list/membership?bookId=" + first + "&bookId=" + second);
        membership.path("items").forEach(item -> assertThat(item.path("included").asBoolean()).isFalse());
        assertThat(json.writeValueAsString(lists.getList(null))).isEqualTo(baseline);
        String revision = get("/api/reading-list").path("revision").asText();
        var add = send("POST", "/api/reading-list/items", Map.of("bookId", second, "expectedRevision", revision), 201);
        revision = add.path("revision").asText();
        var addNext = send("POST", "/api/reading-list/items", Map.of("bookId", first, "expectedRevision", revision), 201);
        assertThat(Long.parseLong(addNext.path("revision").asText())).isEqualTo(Long.parseLong(revision) + 1);

        // A new client represents fresh reloads: confirmed Books/list survive independently of photo drafts.
        http.close();
        http = HttpClient.newHttpClient();
        var reloaded = get("/api/reading-list").path("items");
        assertThat(reloaded.get(reloaded.size() - 2).path("book").path("id").asLong()).isEqualTo(second);
        assertThat(reloaded.get(reloaded.size() - 1).path("book").path("id").asLong()).isEqualTo(first);
        for (long id : created) {
            var book = get("/api/books/" + id);
            assertThat(book.path("readingStatus").asText()).isEqualTo("TO_READ");
            for (String field : List.of("coverUrl", "isbn", "startedOn", "finishedOn")) assertThat(book.path(field).isNull()).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM public.reading_list_entry WHERE book_id=?", Long.class, id)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.flyway_schema_history WHERE success", Long.class)).isEqualTo(13);
    }

    private long create(String title) throws Exception {
        long id = send("POST", "/api/books", Map.of("title", title, "author", "OfflineReviewer"), 201).path("id").asLong();
        created.add(id);
        return id;
    }
    private JsonNode recognize() throws Exception {
        String boundary = "stage7-offline-boundary";
        byte[] prefix = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"rotation\"\r\n\r\n90\r\n--" + boundary
            + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"synthetic.png\"\r\nContent-Type: image/png\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var body = HttpRequest.BodyPublishers.concat(HttpRequest.BodyPublishers.ofByteArray(prefix),
            HttpRequest.BodyPublishers.ofByteArray(CoverTestImages.png().getBytes()),
            HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n"));
        var request = HttpRequest.newBuilder(uri("/api/book-photo-import/recognize"))
            .timeout(Duration.ofSeconds(10)).header("Content-Type", "multipart/form-data; boundary=" + boundary).POST(body).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readTree(response.body());
    }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private JsonNode get(String path) throws Exception { return send("GET", path, null, 200); }
    private JsonNode send(String method, String path, Object body, int status) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10))
            .header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s", method, path).isEqualTo(status);
        return json.readTree(response.body());
    }
}

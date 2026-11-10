package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

/** Real socket -> embedded server -> PostgreSQL commits, never MockMvc or bookdb. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.address=127.0.0.1")
class ReadingListHttpJourneyTest {
    @LocalServerPort private int port;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookService books;
    @Autowired private ReadingListService lists;
    private final List<Long> created = new ArrayList<>();
    private ReadingListDtos.ReadingListResponse baseline;
    private HttpClient client;

    @BeforeEach
    void verifyTargetAndRememberBaseline() {
        assertThat(jdbc.queryForObject("SELECT current_database()", String.class)).isEqualTo("bookdb_tests");
        assertThat(jdbc.queryForObject("SELECT current_user", String.class)).isEqualTo("booktest");
        baseline = lists.getList(null);
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    @AfterEach
    void removeOnlyJourneyFixtures() {
        try {
            for (long id : created) {
                if (jdbc.queryForObject("SELECT count(*) FROM public.book WHERE id=?", Integer.class, id) == 1) books.delete(id);
            }
            assertThat(lists.getList(null).items()).isEqualTo(baseline.items());
            // The suite is exclusive on this disposable database. Restore only its
            // singleton revision after removing our fixtures, not any Book data.
            jdbc.update("UPDATE public.reading_list SET revision=? WHERE id=1", Long.parseLong(baseline.revision()));
        } finally {
            if (client != null) client.close();
        }
    }

    @Test
    void completesTheReadingListJourneyOverRealHttpAndConfirmsCommittedOrder() throws Exception {
        long first = createBook("HTTP journey A");
        JsonNode initial = get("/api/reading-list");
        String revision = initial.path("revision").asText();
        JsonNode firstEntry = add(first, revision);
        revision = firstEntry.path("revision").asText();
        long firstId = firstEntry.path("item").path("entryId").asLong();
        long second = createBook("HTTP journey B");
        long third = createBook("HTTP journey C");
        JsonNode secondEntry = add(second, revision);
        revision = secondEntry.path("revision").asText();
        long secondId = secondEntry.path("item").path("entryId").asLong();
        JsonNode thirdEntry = add(third, revision);
        revision = thirdEntry.path("revision").asText();
        long thirdId = thirdEntry.path("item").path("entryId").asLong();

        JsonNode membership = get("/api/reading-list/membership?bookId=" + first + "&bookId=" + second + "&bookId=" + third);
        assertThat(membership.path("revision").asText()).isEqualTo(revision);
        assertThat(membership.path("items")).hasSize(3);
        membership.path("items").forEach(item -> assertThat(item.path("included").asBoolean()).isTrue());
        JsonNode duplicate = send("POST", "/api/reading-list/items", Map.of("bookId", first, "expectedRevision", revision), 409);
        assertThat(duplicate.path("code").asText()).isEqualTo("READING_LIST_ALREADY_CONTAINS_BOOK");

        String beforeMove = revision;
        int target = Math.toIntExact(baseline.totalItems()) + 1;
        revision = send("POST", "/api/reading-list/items/" + thirdId + "/move",
            Map.of("toPosition", target, "expectedRevision", revision), 200).path("revision").asText();
        assertThat(revision).isEqualTo(Long.toString(Long.parseLong(beforeMove) + 1));
        assertTail(thirdId, firstId, secondId);
        JsonNode stale = send("POST", "/api/reading-list/items/" + firstId + "/move",
            Map.of("toPosition", target, "expectedRevision", beforeMove), 409);
        assertThat(stale.path("code").asText()).isEqualTo("READING_LIST_REVISION_CONFLICT");

        send("POST", "/api/books/" + first + "/start-reading", Map.of("date", "2026-01-01"), 200);
        assertThat(get("/api/books/" + first).path("readingStatus").asText()).isEqualTo("READING");
        send("POST", "/api/books/" + first + "/finish-reading", Map.of("date", "2026-02-02"), 200);
        JsonNode filtered = get("/api/reading-list?readingStatus=READ");
        JsonNode read = findBook(filtered, first);
        assertThat(read.path("position").asInt()).isEqualTo(target + 1);
        assertThat(read.path("book").path("finishedOn").asText()).isEqualTo("2026-02-02");
        assertThat(filtered.path("revision").asText()).isEqualTo(revision);

        send("PUT", "/api/books/" + first + "/reading-dates",
            Map.of("startedOn", "2026-01-03", "finishedOn", "2026-02-04"), 200);
        assertThat(get("/api/books/" + first).path("finishedOn").asText()).isEqualTo("2026-02-04");
        send("PATCH", "/api/books/" + first + "/reading-status", Map.of("readingStatus", "ABANDONED"), 200);
        assertThat(get("/api/books/" + first).path("finishedOn").asText()).isEqualTo("2026-02-04");

        revision = send("DELETE", "/api/reading-list/items/" + secondId + "?expectedRevision=" + revision, null, 200)
            .path("revision").asText();
        assertThat(get("/api/books/" + second).path("id").asLong()).isEqualTo(second);
        assertTail(thirdId, firstId);
        send("DELETE", "/api/books/" + third, null, 204);
        JsonNode reloaded = get("/api/reading-list");
        assertThat(reloaded.path("revision").asText()).isEqualTo(Long.toString(Long.parseLong(revision) + 1));
        assertTail(firstId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.reading_list_entry WHERE book_id=?", Integer.class, third)).isZero();
        assertThat(jdbc.queryForObject("SELECT position FROM public.reading_list_entry WHERE id=?", Integer.class, firstId)).isEqualTo(target);
        JsonNode paths = get("/v3/api-docs").path("paths");
        assertThat(paths.path("/api/reading-list/items/{entryId}/move").has("post")).isTrue();
    }

    private long createBook(String title) throws Exception {
        long id = send("POST", "/api/books", Map.of("title", title, "author", "Isolated HTTP validation"), 201).path("id").asLong();
        created.add(id);
        return id;
    }

    private JsonNode add(long bookId, String revision) throws Exception {
        return send("POST", "/api/reading-list/items", Map.of("bookId", bookId, "expectedRevision", revision), 201);
    }

    private JsonNode get(String path) throws Exception { return send("GET", path, null, 200); }

    private JsonNode send(String method, String path, Object body, int expectedStatus) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
            .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s", method, path).isEqualTo(expectedStatus);
        return response.body().isBlank() ? json.nullNode() : json.readTree(response.body());
    }

    private JsonNode findBook(JsonNode list, long bookId) {
        for (JsonNode item : list.path("items")) if (item.path("book").path("id").asLong() == bookId) return item;
        throw new AssertionError("Expected book missing from HTTP list");
    }

    private void assertTail(Long... ids) throws Exception {
        JsonNode list = get("/api/reading-list");
        var actual = new ArrayList<Long>();
        int position = 1;
        for (JsonNode item : list.path("items")) {
            assertThat(item.path("position").asInt()).isEqualTo(position++);
            if (position - 1 > baseline.totalItems()) actual.add(item.path("entryId").asLong());
        }
        assertThat(actual).containsExactly(ids);
        assertThat(list.path("totalItems").asLong()).isEqualTo(baseline.totalItems() + ids.length);
    }
}

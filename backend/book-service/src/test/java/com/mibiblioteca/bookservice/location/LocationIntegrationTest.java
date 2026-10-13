package com.mibiblioteca.bookservice.location;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LocationIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private jakarta.persistence.EntityManager entityManager;
    @Autowired private jakarta.persistence.EntityManagerFactory entityManagerFactory;
    @Autowired private com.mibiblioteca.bookservice.book.service.BookService bookService;
    @Autowired private LocationService locationService;

    private long create(String resource, Map<String, Object> body) throws Exception {
        return json(mvc.perform(post("/api/" + resource).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
    }
    private JsonNode json(String value) throws Exception { return mapper.readTree(value); }
    private long room(String name) throws Exception { return create("rooms", Map.of("name", name)); }
    private long bookcase(long room, String name) throws Exception { return create("bookcases", Map.of("roomId", room, "name", name)); }
    private long shelf(long bookcase, String name) throws Exception { return create("shelves", Map.of("bookcaseId", bookcase, "name", name)); }
    private Map<String, Object> book() { return new LinkedHashMap<>(Map.of("title", "Shelf book", "author", "Shelf author")); }

    @Test void hierarchyCountsAndRenamesUseStableIdsAndNeverConvertLegacy() throws Exception {
        long room = room(" \u00a0Salón "); long bookcase = bookcase(room, " Billy  izquierda / nº 2 "); long shelf = shelf(bookcase, " Superior ");
        var data = book(); data.put("location", Map.of("kind", "SHELF", "shelfId", shelf)); long book = create("books", data);
        var legacy = book(); legacy.put("room", "Salón"); legacy.put("bookcase", "Billy  izquierda / nº 2"); legacy.put("shelf", "Superior"); long old = create("books", legacy);
        mvc.perform(get("/api/books/{id}", book)).andExpect(jsonPath("$.roomId").value(room)).andExpect(jsonPath("$.bookcaseId").value(bookcase)).andExpect(jsonPath("$.shelfId").value(shelf)).andExpect(jsonPath("$.locationPending").value(false));
        mvc.perform(get("/api/locations")).andExpect(jsonPath("$[0].name").value("Salón")).andExpect(jsonPath("$[0].bookCount").value(1))
            .andExpect(jsonPath("$[0].canDelete").value(false)).andExpect(jsonPath("$[0].blockedReason").value("BOOKCASES"))
            .andExpect(jsonPath("$[0].bookcases[0].bookCount").value(1)).andExpect(jsonPath("$[0].bookcases[0].shelves[0].blockedReason").value("BOOKS"));
        mvc.perform(put("/api/rooms/{id}", room).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Dormitorio\"}")).andExpect(status().isOk());
        mvc.perform(put("/api/bookcases/{id}", bookcase).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Negra\"}")).andExpect(status().isOk());
        mvc.perform(put("/api/shelves/{id}", shelf).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"3\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/books/{id}", book)).andExpect(jsonPath("$.room").value("Dormitorio")).andExpect(jsonPath("$.bookcase").value("Negra")).andExpect(jsonPath("$.shelf").value("3")).andExpect(jsonPath("$.shelfId").value(shelf));
        mvc.perform(get("/api/books/{id}", old)).andExpect(jsonPath("$.room").value("Salón")).andExpect(jsonPath("$.locationPending").value(true)).andExpect(jsonPath("$.shelfId").isEmpty());
    }

    @Test void explicitAssignmentSwitchesRepresentationsAndNullOrOmissionClears() throws Exception {
        long shelf = shelf(bookcase(room("Room"), "Case"), "Abajo");
        var data = book(); data.put("room", "Old Room"); long id = create("books", data);
        mvc.perform(put("/api/books/{id}/location", id).contentType(MediaType.APPLICATION_JSON).content("{\"shelfId\":" + shelf + "}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.room").value("Room")).andExpect(jsonPath("$.locationPending").value(false));
        var stored = jdbc.queryForMap("select room,bookcase,shelf,shelf_id from book where id=?", id);
        assertThat(stored.get("room")).isNull(); assertThat(stored.get("bookcase")).isNull(); assertThat(stored.get("shelf")).isNull(); assertThat(stored.get("shelf_id")).isEqualTo(shelf);
        data.remove("room"); data.put("location", Map.of("kind", "LEGACY", "room", " Dormitorio "));
        mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.room").value("Dormitorio")).andExpect(jsonPath("$.shelfId").isEmpty()).andExpect(jsonPath("$.locationPending").value(true));
        data.put("location", null);
        mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.room").isEmpty()).andExpect(jsonPath("$.locationPending").value(false));
        mvc.perform(put("/api/books/{id}/location", id).contentType(MediaType.APPLICATION_JSON).content("{\"shelfId\":" + shelf + "}")).andExpect(status().isOk());
        mvc.perform(put("/api/books/{id}/location", id).contentType(MediaType.APPLICATION_JSON).content("{\"shelfId\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.shelfId").isEmpty()).andExpect(jsonPath("$.room").isEmpty());
        data.remove("location"); mvc.perform(put("/api/books/{id}", id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data))).andExpect(status().isOk());
    }

    @ParameterizedTest @ValueSource(strings = {"room", "bookcase", "shelf"})
    void rejectsDualRepresentationEvenExplicitNull(String key) throws Exception {
        for (Object location : Arrays.asList(null, Map.of("kind", "LEGACY", "room", "X"), Map.of("kind", "SHELF", "shelfId", 1))) {
            var data = book(); data.put("location", location); data.put(key, null);
            mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LOCATION"));
        }
    }

    @ParameterizedTest @ValueSource(strings = {
        "{\"kind\":\"SHELF\"}", "{\"kind\":\"SHELF\",\"shelfId\":0}", "{\"kind\":\"SHELF\",\"shelfId\":1.5}",
        "{\"kind\":\"SHELF\",\"shelfId\":\"1\"}", "{\"kind\":\"LEGACY\",\"shelfId\":1}", "{\"kind\":\"OTHER\"}",
        "{\"kind\":\"SHELF\",\"shelfId\":1,\"room\":null}", "{\"kind\":\"LEGACY\",\"room\":\"a\\nb\"}"
    }) void rejectsInvalidLocationObjects(String location) throws Exception {
        mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Book\",\"author\":\"Author\",\"location\":" + location + "}"))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest @ValueSource(strings = {"rooms", "bookcases", "shelves"})
    void postgresUniqueNamesIgnoreCaseButNotAccentsAndRespectParents(String resource) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>(); data.put("name", "Salón");
        if (resource.equals("bookcases")) data.put("roomId", room("Parent"));
        if (resource.equals("shelves")) data.put("bookcaseId", bookcase(room("Parent"), "Case"));
        create(resource, data); data.put("name", "Salon"); create(resource, data);
        if (!resource.equals("rooms")) {
            data.put(resource.equals("bookcases") ? "roomId" : "bookcaseId", resource.equals("bookcases") ? room("Other") : bookcase(room("Other"), "Case"));
            data.put("name", "Salón"); create(resource, data);
        }
        data.put("name", "salón");
        mvc.perform(post("/api/" + resource).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LOCATION_NAME_CONFLICT"))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("uq_"))));
    }

    @ParameterizedTest @ValueSource(strings = {"rooms", "bookcases", "shelves"})
    void renameConflictsAndDeleteInUse(String resource) throws Exception {
        long room = room("Parent"); long bookcase = bookcase(room, "Case"); long shelf = shelf(bookcase, "3");
        var book = book(); book.put("location", Map.of("kind", "SHELF", "shelfId", shelf)); create("books", book);
        long id = resource.equals("rooms") ? room : resource.equals("bookcases") ? bookcase : shelf;
        mvc.perform(delete("/api/" + resource + "/" + id)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LOCATION_IN_USE"));
        Map<String, Object> other = new LinkedHashMap<>(); other.put("name", "Duplicate");
        if (resource.equals("bookcases")) other.put("roomId", room); if (resource.equals("shelves")) other.put("bookcaseId", bookcase); create(resource, other);
        mvc.perform(put("/api/" + resource + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"duplicate\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LOCATION_NAME_CONFLICT"));
    }

    @Test void emptyHierarchyCanBeDeletedBottomUpAndMissingParentsAre404() throws Exception {
        long room = room("Room"); long bookcase = bookcase(room, "Billy"); long shelf = shelf(bookcase, "3");
        mvc.perform(delete("/api/shelves/{id}", shelf)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/bookcases/{id}", bookcase)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/rooms/{id}", room)).andExpect(status().isNoContent());
        for (String resource : List.of("rooms", "bookcases", "shelves")) mvc.perform(delete("/api/" + resource + "/999999999")).andExpect(status().isNotFound());
        mvc.perform(post("/api/bookcases").contentType(MediaType.APPLICATION_JSON).content("{\"roomId\":999999999,\"name\":\"Billy\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/shelves").contentType(MediaType.APPLICATION_JSON).content("{\"bookcaseId\":999999999,\"name\":\"3\"}")).andExpect(status().isNotFound());
        var data = book(); data.put("location", Map.of("kind", "SHELF", "shelfId", 999999999));
        mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(data))).andExpect(status().isNotFound()).andExpect(jsonPath("$.errors['location.shelfId']").exists());
    }

    static Stream<Arguments> badNames() {
        return Stream.of("rooms", "bookcases", "shelves").flatMap(resource -> Stream.of("", "   ", "\u00a0", "\0", "\t", "\r", "\n", "\u007f", "\u0085", "\u2028", "\u2029", "x".repeat(resource.equals("shelves") ? 51 : 101))
            .map(name -> Arguments.of(resource, name)));
    }
    @ParameterizedTest @MethodSource("badNames") void rawInvalidNamesReturn400(String resource, String name) throws Exception {
        long room = room("Parent"); long bookcase = bookcase(room, "Case"); long shelf = shelf(bookcase, "3");
        var body = new LinkedHashMap<String, Object>(); body.put("name", name);
        if (resource.equals("bookcases")) body.put("roomId", room); if (resource.equals("shelves")) body.put("bookcaseId", bookcase);
        mvc.perform(post("/api/" + resource).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body))).andExpect(status().isBadRequest());
        long id = resource.equals("rooms") ? room : resource.equals("bookcases") ? bookcase : shelf;
        mvc.perform(put("/api/" + resource + "/" + id).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("name", name)))).andExpect(status().isBadRequest());
    }

    @Test void effectiveNameAndIdFiltersCombineWithPagingAndSearchWithoutAssociatingLegacy() throws Exception {
        long room = room("Salón"); long bookcase = bookcase(room, "Billy"); long shelf = shelf(bookcase, "3");
        var structured = book(); structured.put("isbn", "9780306406157"); structured.put("location", Map.of("kind", "SHELF", "shelfId", shelf)); create("books", structured);
        var legacy = book(); legacy.put("room", "Salón"); legacy.put("bookcase", "Billy"); legacy.put("shelf", "3"); create("books", legacy);
        for (String endpoint : List.of("/api/books", "/api/books/search")) {
            for (String[] filter : List.of(new String[]{"roomId", Long.toString(room)}, new String[]{"bookcaseId", Long.toString(bookcase)}, new String[]{"shelfId", Long.toString(shelf)})) {
                mvc.perform(get(endpoint).param("title", "Shelf book").param(filter[0], filter[1])).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
            }
            mvc.perform(get(endpoint).param("title", "Shelf book").param("room", "salón").param("bookcase", "BILLY").param("shelf", "3").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2));
            mvc.perform(get(endpoint).param("title", "Shelf book").param("roomId", Long.toString(room)).param("room", "Salon"))
                .andExpect(jsonPath("$.totalElements").value(0));
            mvc.perform(get(endpoint).param("title", "Shelf book").param("shelfId", "999999999"))
                .andExpect(jsonPath("$.totalElements").value(0));
            mvc.perform(get(endpoint).param("title", "Shelf book").param("roomId", Long.toString(room)).param("size", "1").param("page", "4"))
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content").isEmpty());
        }
        mvc.perform(get("/api/books/search").param("isbn", "9780306406157").param("shelfId", Long.toString(shelf)))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @ParameterizedTest @ValueSource(strings = {"roomId", "bookcaseId", "shelfId"})
    void invalidIdFiltersAre400(String field) throws Exception {
        for (String value : List.of("", "0", "-1", "1.2", " 1", "9007199254740992", "999999999999999999999")) mvc.perform(get("/api/books").param(field, value))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + field).exists());
        mvc.perform(get("/api/books").param(field, "1", "2")).andExpect(status().isBadRequest());
    }

    @Test void responseMappingDoesNotTriggerNPlusOneForDistinctShelves() throws Exception {
        for (int i = 0; i < 5; i++) {
            var data = book(); data.put("location", Map.of("kind", "SHELF", "shelfId", shelf(bookcase(room("Room " + i), "Case"), "3"))); create("books", data);
        }
        entityManager.flush(); entityManager.clear();
        var stats = entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        boolean enabled = stats.isStatisticsEnabled(); stats.setStatisticsEnabled(true);
        try {
            stats.clear(); bookService.findAll(0, 20, "title", org.springframework.data.domain.Sort.Direction.ASC);
            assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(2);
            entityManager.clear(); stats.clear(); locationService.hierarchy();
            assertThat(stats.getPrepareStatementCount()).isEqualTo(4);
        } finally { stats.setStatisticsEnabled(enabled); }
    }

    @ParameterizedTest @ValueSource(strings = {"{}", "{\"room\":\"Old\"}", "{\"shelfId\":\"3\"}", "{\"shelfId\":1.5}", "{\"shelfId\":3,\"room\":null}"})
    void locationWriteRequiresExplicitShelfIdAndRejectsUnexpectedRepresentation(String body) throws Exception {
        long id = create("books", book());
        mvc.perform(put("/api/books/{id}/location", id).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
    }

    @ParameterizedTest @ValueSource(strings = {"rooms", "bookcases", "shelves"})
    void rawNameMaximumIsAcceptedAndParentCannotBeChangedByRename(String resource) throws Exception {
        long room = room("Parent"); long bookcase = bookcase(room, "Case");
        Map<String, Object> body = new LinkedHashMap<>(); body.put("name", "á".repeat(resource.equals("shelves") ? 50 : 100));
        if (resource.equals("bookcases")) body.put("roomId", room); if (resource.equals("shelves")) body.put("bookcaseId", bookcase);
        long id = create(resource, body);
        mvc.perform(put("/api/" + resource + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Renamed\",\"roomId\":999999,\"bookcaseId\":999999}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        if (!resource.equals("rooms")) assertThat(jdbc.queryForObject("select " + (resource.equals("bookcases") ? "room_id" : "bookcase_id") + " from " + (resource.equals("bookcases") ? "bookcase" : "shelf") + " where id=?", Long.class, id)).isEqualTo(resource.equals("bookcases") ? room : bookcase);
    }
}

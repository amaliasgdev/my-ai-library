package com.mibiblioteca.bookservice.inventory;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.mibiblioteca.bookservice.inventory.InventorySessionDtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.location.LocationService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import java.util.List;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class InventorySessionIntegrationTest {
    @Autowired InventorySessionService service;
    @Autowired LocationService locations;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired EntityManagerFactory emf;
    @Autowired jakarta.persistence.EntityManager entityManager;
    long shelf, room;
    @BeforeEach void fixture() {
        room = locations.createRoom("Inventory room").id();
        long bookcase = locations.createBookcase(room,"Inventory bookcase").id();
        shelf = locations.createShelf(bookcase,"Inventory shelf").id();
    }
    private String path() { return "/api/shelves/" + shelf + "/inventory-sessions"; }
    private InventorySessionResponse create() { return service.create(shelf,null); }
    @ParameterizedTest @ValueSource(strings = {"", "{}", "{\"notes\":null}", "{\"notes\":\"  \"}"})
    void optionalCreationBodyStartsImmediatelyWithSameTimestamps(String body) throws Exception {
        var request = post(path()); if (!body.isEmpty()) request.contentType(MediaType.APPLICATION_JSON).content(body);
        var result = mvc.perform(request).andExpect(status().isCreated()).andExpect(header().exists("Location")).andExpect(jsonPath("$.status").value("IN_PROGRESS")).andExpect(jsonPath("$.notes").isEmpty()).andReturn();
        var value = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(value.get("createdAt")).isEqualTo(value.get("updatedAt")).isEqualTo(value.get("startedAt"));
        assertThat(value.get("completedAt").isNull()).isTrue(); assertThat(value.get("cancelledAt").isNull()).isTrue();
    }
    @Test void notesValidateOriginalLengthAndPreserveInteriorMultiline() throws Exception {
        String notes = "\u00a0  First  line\nSecond line \ufeff";
        mvc.perform(post(path()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new CreateInventorySessionRequest(notes))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.notes").value("First  line\nSecond line"));
        var session = service.history(shelf,0,20).activeSession();
        mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new UpdateInventorySessionNotesRequest("x".repeat(2000)))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.notes").value("x".repeat(2000)));
        mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new UpdateInventorySessionNotesRequest(" ".repeat(2001)))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.notes").exists());
        mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.notes").isEmpty());
    }
    @Test void overlongCreateNotesAreField400BeforeInsert() throws Exception {
        mvc.perform(post(path()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new CreateInventorySessionRequest(" ".repeat(2001)))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.notes").exists());
        assertThat(service.history(shelf,0,20).totalElements()).isZero();
    }
    @ParameterizedTest @ValueSource(strings = {"complete", "cancel"})
    void terminalTransitionsAreImmutableAndAllowANewSession(String action) throws Exception {
        var session = create();
        mvc.perform(post("/api/inventory-sessions/{id}/" + action,session.id())).andExpect(status().isOk());
        var terminal = service.get(session.id());
        assertThat(terminal.status()).isEqualTo(action.equals("complete") ? InventorySessionStatus.COMPLETED : InventorySessionStatus.CANCELLED);
        assertThat(action.equals("complete") ? terminal.completedAt() : terminal.cancelledAt()).isEqualTo(terminal.updatedAt()).isAfterOrEqualTo(terminal.startedAt());
        assertThat(action.equals("complete") ? terminal.cancelledAt() : terminal.completedAt()).isNull();
        for (String next : List.of("complete", "cancel")) mvc.perform(post("/api/inventory-sessions/{id}/"+next,session.id()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_SESSION_INVALID_TRANSITION"));
        mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"No\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_SESSION_CLOSED"));
        assertThat(service.get(session.id())).isEqualTo(terminal);
        assertThat(create().id()).isNotEqualTo(session.id());
    }
    @Test void historyIsPagedStableAndActiveIsIndependentOfPageWithCurrentContext() throws Exception {
        var a=create(); service.complete(a.id()); var b=create(); service.cancel(b.id()); var active=create();
        // Force a timestamp tie: ID remains a deterministic descending tie breaker.
        jdbc.update("UPDATE inventory_session SET started_at=created_at WHERE shelf_id=?",shelf);
        mvc.perform(get(path()).param("page","1").param("size","1")).andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.totalPages").value(3))
            .andExpect(jsonPath("$.content[0].id").value(b.id())).andExpect(jsonPath("$.activeSession.id").value(active.id()))
            .andExpect(jsonPath("$.shelf.roomName").value("Inventory room"));
        mvc.perform(get(path()).param("page","100")).andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.totalElements").value(3));
        locations.renameRoom(room,"Renamed room");
        mvc.perform(get("/api/inventory-sessions/{id}",a.id())).andExpect(status().isOk()).andExpect(jsonPath("$.shelf.roomName").value("Renamed room"));
    }
    @Test void emptyShelfHistoryIs200() throws Exception { mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.activeSession").isEmpty()); }
    @ParameterizedTest @ValueSource(strings = {"?page=-1", "?size=0", "?size=101", "?page=abc"})
    void invalidPaginationIs400(String query) throws Exception { mvc.perform(get(path()+query)).andExpect(status().isBadRequest()); }
    @Test void missingShelfSessionAndInvalidIdsAreSafe() throws Exception {
        mvc.perform(post("/api/shelves/9007199254740991/inventory-sessions")).andExpect(status().isNotFound());
        mvc.perform(get("/api/inventory-sessions/9007199254740991")).andExpect(status().isNotFound());
        for(String id:List.of("0","-1","abc","9007199254740992")) mvc.perform(get("/api/inventory-sessions/"+id)).andExpect(status().isBadRequest());
        mvc.perform(post(path()).contentType(MediaType.APPLICATION_JSON).content("{" )).andExpect(status().isBadRequest());
    }
    @Test void anyHistoryBlocksShelfDeletionAndDoesNotChangeBookCounts() throws Exception {
        var session=create(); service.cancel(session.id());
        var node=locations.hierarchy().stream().filter(r -> r.id()==room).findFirst().orElseThrow().bookcases().getFirst().shelves().getFirst();
        assertThat(node.canDelete()).isFalse(); assertThat(node.bookCount()).isZero(); assertThat(node.blockedReason()).isEqualTo("INVENTORY_SESSIONS");
        mvc.perform(delete("/api/shelves/{id}",shelf)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LOCATION_IN_USE"));
        jdbc.update("INSERT INTO book(title,author,shelf_id) VALUES ('Book','Author',?)",shelf);
        node=locations.hierarchy().stream().filter(r -> r.id()==room).findFirst().orElseThrow().bookcases().getFirst().shelves().getFirst();
        assertThat(node.blockedReason()).isEqualTo("BOOKS"); assertThat(node.bookCount()).isEqualTo(1);
    }
    @Test void detailAndHistoryHaveBoundedQueryCounts() {
        var s=create();
        var stats=emf.unwrap(SessionFactory.class).getStatistics(); stats.setStatisticsEnabled(true);
        try {
            entityManager.flush(); entityManager.clear();
            stats.clear(); service.history(shelf,0,20); assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(4);
            stats.clear(); service.get(s.id()); assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(1);
        } finally { stats.setStatisticsEnabled(false); }
    }
}

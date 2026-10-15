package com.mibiblioteca.bookservice.inventory;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.location.LocationService;
import com.mibiblioteca.bookservice.location.ShelfRepository;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class InventorySessionConcurrencyTest {
    @Autowired InventorySessionService service;
    @Autowired LocationService locations;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @SpyBean InventorySessionRepository sessions;
    @SpyBean ShelfRepository shelves;
    long shelf, bookcase, room;
    @Autowired jakarta.persistence.EntityManager entityManager;
    private Optional<com.mibiblioteca.bookservice.location.Shelf> lockShelf() {
        return Optional.ofNullable(entityManager.find(com.mibiblioteca.bookservice.location.Shelf.class,shelf,jakarta.persistence.LockModeType.PESSIMISTIC_READ));
    }
    private Optional<InventorySession> lockSession(long id) {
        return Optional.ofNullable(entityManager.find(InventorySession.class,id,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE));
    }
    @BeforeEach void fixture() {
        reset(sessions,shelves);
        room=locations.createRoom("Inventory race " + UUID.randomUUID()).id();
        bookcase=locations.createBookcase(room,"Case").id(); shelf=locations.createShelf(bookcase,"Shelf").id();
    }
    @AfterEach void cleanup() {
        reset(sessions,shelves);
        jdbc.update("DELETE FROM inventory_session WHERE shelf_id=?",shelf);
        jdbc.update("DELETE FROM shelf WHERE id=?",shelf); jdbc.update("DELETE FROM bookcase WHERE id=?",bookcase); jdbc.update("DELETE FROM room WHERE id=?",room);
    }
    @Test void twoRealCreatesHaveExactlyOne201AndOneSpecific409() throws Exception {
        var barrier=new CyclicBarrier(2);
        doAnswer(call -> { var result=lockShelf(); barrier.await(10,TimeUnit.SECONDS); return result; }).when(shelves).lockForInventory(shelf);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<org.springframework.mock.web.MockHttpServletResponse> create=() -> mvc.perform(post("/api/shelves/{id}/inventory-sessions",shelf)).andReturn().getResponse();
            var a=executor.submit(create); var b=executor.submit(create);
            var responses=List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
            assertThat(responses.stream().map(r -> r.getStatus())).containsExactlyInAnyOrder(201,409);
            var conflict=responses.stream().filter(r -> r.getStatus()==409).findFirst().orElseThrow();
            assertThat(mapper.readTree(conflict.getContentAsString()).path("code").asText()).isEqualTo("INVENTORY_SESSION_ALREADY_ACTIVE");
            assertThat(conflict.getContentAsString()).doesNotContain("uq_inventory", "SQL");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_session WHERE shelf_id=?",Long.class,shelf)).isEqualTo(1);
    }
    @Test void completeAndCancelCompeteOnSameRowOnlyOneWins() throws Exception {
        var session=service.create(shelf,null); var barrier=new CyclicBarrier(2);
        doAnswer(call -> { barrier.await(10,TimeUnit.SECONDS); return lockSession(session.id()); }).when(sessions).lockById(session.id());
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var a=executor.submit(() -> mvc.perform(post("/api/inventory-sessions/{id}/complete",session.id())).andReturn().getResponse());
            var b=executor.submit(() -> mvc.perform(post("/api/inventory-sessions/{id}/cancel",session.id())).andReturn().getResponse());
            var results=List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
            assertThat(results.stream().map(r -> r.getStatus())).containsExactlyInAnyOrder(200,409);
            assertThat(mapper.readTree(results.stream().filter(r -> r.getStatus()==409).findFirst().orElseThrow().getContentAsString()).path("code").asText()).isEqualTo("INVENTORY_SESSION_INVALID_TRANSITION");
        }
    }
    @Test void notesWaitingForCloseNeverApplyAfterItCommits() throws Exception {
        var session=service.create(shelf,null); var locked=new CountDownLatch(1); var release=new CountDownLatch(1); var second=new CountDownLatch(1); var calls=new AtomicInteger();
        doAnswer(call -> {
            int n=calls.incrementAndGet(); if(n==2) second.countDown();
            var result=lockSession(session.id());
            if(n==1) { locked.countDown(); if(!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out"); }
            return result;
        }).when(sessions).lockById(session.id());
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var close=executor.submit(() -> mvc.perform(post("/api/inventory-sessions/{id}/complete",session.id())).andReturn().getResponse().getStatus());
            try {
                assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
                var notes=executor.submit(() -> mvc.perform(put("/api/inventory-sessions/{id}/notes",session.id()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"late\"}")).andReturn().getResponse());
                assertThat(second.await(10,TimeUnit.SECONDS)).isTrue(); release.countDown();
                assertThat(close.get(15,TimeUnit.SECONDS)).isEqualTo(200);
                var response=notes.get(15,TimeUnit.SECONDS); assertThat(response.getStatus()).isEqualTo(409);
                assertThat(mapper.readTree(response.getContentAsString()).path("code").asText()).isEqualTo("INVENTORY_SESSION_CLOSED");
            } finally { release.countDown(); }
        }
        assertThat(service.get(session.id()).notes()).isNull();
    }
    @Test void shelfShareLockCoordinatesCreateAndConcurrentDeleteWithoutLosingHistory() throws Exception {
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1); var deleting=new CountDownLatch(1);
        doAnswer(call -> { var result=lockShelf(); locked.countDown(); if(!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out"); return result; }).when(shelves).lockForInventory(shelf);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var create=executor.submit(() -> mvc.perform(post("/api/shelves/{id}/inventory-sessions",shelf)).andReturn().getResponse().getStatus());
            try {
                assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
                var delete=executor.submit(() -> { deleting.countDown(); return mvc.perform(delete("/api/shelves/{id}",shelf)).andReturn().getResponse().getStatus(); });
                assertThat(deleting.await(10,TimeUnit.SECONDS)).isTrue(); release.countDown();
                assertThat(create.get(15,TimeUnit.SECONDS)).isEqualTo(201); assertThat(delete.get(15,TimeUnit.SECONDS)).isEqualTo(409);
            } finally { release.countDown(); }
        }
        assertThat(service.history(shelf,0,20).totalElements()).isEqualTo(1);
    }
}

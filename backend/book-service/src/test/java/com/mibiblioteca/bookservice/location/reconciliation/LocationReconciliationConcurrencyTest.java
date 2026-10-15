package com.mibiblioteca.bookservice.location.reconciliation;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Real committed PostgreSQL transactions, bounded latches, no sleeps or application-table truncation. */
@SpringBootTest
@AutoConfigureMockMvc
class LocationReconciliationConcurrencyTest {
    @Autowired LocationReconciliationService service;
    @SpyBean LocationReconciliationRepository repository;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    long room, bookcase, shelf, first, second;
    String name;
    AssignRequest request;
    @BeforeEach void fixture() {
        reset(repository);
        name="Reconcile race " + UUID.randomUUID();
        room=jdbc.queryForObject("INSERT INTO room(name) VALUES (?) RETURNING id",Long.class,name);
        bookcase=jdbc.queryForObject("INSERT INTO bookcase(room_id,name) VALUES (?,'Case') RETURNING id",Long.class,room);
        shelf=jdbc.queryForObject("INSERT INTO shelf(bookcase_id,name) VALUES (?,'Shelf') RETURNING id",Long.class,bookcase);
        first=book(); second=book();
        var group=service.groups(0,20,Type.ALL,name).content().getFirst(); var detail=service.detail(group.groupKey(),0,20);
        request=new AssignRequest(detail.reviewToken(),shelf,new Labels(name,"Case","Shelf"));
    }
    private long book() { return jdbc.queryForObject("INSERT INTO book(title,author,room,bookcase,shelf) VALUES ('Race book','Race author',?,'Case','Shelf') RETURNING id",Long.class,name); }
    @AfterEach void cleanup() {
        reset(repository);
        jdbc.update("DELETE FROM book WHERE id IN (?,?)",first,second);
        jdbc.update("DELETE FROM shelf WHERE id=?",shelf); jdbc.update("DELETE FROM bookcase WHERE id=?",bookcase); jdbc.update("DELETE FROM room WHERE id=?",room);
    }
    private int post() throws Exception { return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(request))).andReturn().getResponse().getStatus(); }
    @Test void twoConcurrentConfirmationsCompleteAtMostOnceAndTranslateSerializationTo409() throws Exception {
        CountDownLatch locked=new CountDownLatch(1),secondAttempt=new CountDownLatch(1),release=new CountDownLatch(1);
        AtomicInteger calls=new AtomicInteger();
        doAnswer(invocation -> {
            int call=calls.incrementAndGet();
            if (call==2) secondAttempt.countDown();
            var result=invocation.callRealMethod();
            if (call==1) { locked.countDown(); if (!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test release timed out"); }
            return result;
        }).when(repository).members(any(),eq(true));
        try (var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            Future<Integer> a=executor.submit(this::post);
            try {
                assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
                Future<Integer> b=executor.submit(this::post);
                assertThat(secondAttempt.await(10,TimeUnit.SECONDS)).isTrue(); release.countDown();
                assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
            } finally { release.countDown(); }
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book WHERE id IN (?,?) AND shelf_id=? AND room IS NULL AND bookcase IS NULL AND shelf IS NULL",Long.class,first,second,shelf)).isEqualTo(2);
    }
    @Test void unexpectedAffectedCountRollsBackActualWritesToEveryMember() {
        doAnswer(invocation -> { invocation.callRealMethod(); return 1; }).when(repository).assign(anyList(),eq(shelf));
        assertThatThrownBy(() -> service.assign(request)).isInstanceOf(ReconciliationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book WHERE id IN (?,?) AND shelf_id IS NULL AND room=?",Long.class,first,second,name)).isEqualTo(2);
    }
    @Test void concurrentLegacyChangeAfterTransactionSnapshotCannotBeOverwritten() throws Exception {
        CountDownLatch destinationLocked=new CountDownLatch(1),release=new CountDownLatch(1);
        doAnswer(invocation -> {
            var result=invocation.callRealMethod(); destinationLocked.countDown();
            if (!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
            return result;
        }).when(repository).lockDestination(shelf);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            Future<Integer> response=executor.submit(this::post);
            try {
                assertThat(destinationLocked.await(10,TimeUnit.SECONDS)).isTrue();
                jdbc.update("UPDATE book SET room='User changed location' WHERE id=?",first);
                release.countDown(); assertThat(response.get(15,TimeUnit.SECONDS)).isEqualTo(409);
            } finally { release.countDown(); }
        }
        assertThat(jdbc.queryForObject("SELECT room FROM book WHERE id=?",String.class,first)).isEqualTo("User changed location");
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book WHERE id=?",Long.class,second)).isNull();
    }
    @Test void destinationShareLocksBlockRenameAndDeleteUntilCommit() throws Exception {
        CountDownLatch destinationLocked=new CountDownLatch(1),release=new CountDownLatch(1);
        doAnswer(invocation -> {
            var result=invocation.callRealMethod(); destinationLocked.countDown();
            if (!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out"); return result;
        }).when(repository).lockDestination(shelf);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            Future<Integer> response=executor.submit(this::post);
            try {
                assertThat(destinationLocked.await(10,TimeUnit.SECONDS)).isTrue();
                for(String sql:List.of("UPDATE room SET name='Rename' WHERE id="+room,"UPDATE bookcase SET name='Rename' WHERE id="+bookcase,"UPDATE shelf SET name='Rename' WHERE id="+shelf,"DELETE FROM shelf WHERE id="+shelf)) {
                    jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
                        try(var statement=connection.createStatement()) {
                            statement.execute("SET lock_timeout='250ms'");
                            try { assertThatThrownBy(() -> statement.executeUpdate(sql)).isInstanceOfSatisfying(java.sql.SQLException.class,e -> assertThat(e.getSQLState()).isEqualTo("55P03")); }
                            finally { statement.execute("SET lock_timeout=0"); }
                        } return null;
                    });
                }
                release.countDown(); assertThat(response.get(15,TimeUnit.SECONDS)).isEqualTo(200);
            } finally { release.countDown(); }
        }
    }
}

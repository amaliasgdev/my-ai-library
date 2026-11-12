package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.MoveSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real commits and independent connections; latches control interleavings, never sleeps. */
@SpringBootTest
class SagaVolumeConcurrencyTest {
    @Autowired private SagaService sagaService;
    @Autowired private SagaVolumeService volumeService;
    @Autowired private BookService bookService;
    @Autowired private BookRepository books;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    private final List<Long> createdBooks = new ArrayList<>();

    @BeforeEach
    @AfterEach
    void cleanCommittedFixtures() {
        jdbc.update("DELETE FROM public.saga_volume");
        jdbc.update("DELETE FROM public.saga");
        jdbc.update("DELETE FROM public.reading_list_entry");
        for (long id : createdBooks) {
            jdbc.update("DELETE FROM public.book WHERE id=?", id);
        }
        createdBooks.clear();
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @Test
    void simultaneousAppendsWithTheSameRevisionCommitOnce() throws Exception {
        long saga = saga();
        long first = book("Primero");
        long second = book("Segundo");
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.add(saga, new AddSagaVolumeRequest(first, null, null, "0"))));
            var b = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.add(saga, new AddSagaVolumeRequest(second, null, null, "0"))));
            try {
                await(ready);
            } finally {
                go.countDown();
            }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("ok", "SAGA_REVISION_CONFLICT");
        }

        var confirmed = volumeService.findAll(saga);
        assertThat(confirmed.revision()).isEqualTo("1");
        assertThat(confirmed.volumes()).hasSize(1);
        assertThat(confirmed.volumes().getFirst().position()).isEqualTo(1);
    }

    @Test
    void simultaneousEffectiveMovesCommitOnceAndRejectTheStaleWriter() throws Exception {
        long saga = saga();
        long first = pendingId(saga, "A", "0");
        pendingId(saga, "B", "1");
        long third = pendingId(saga, "C", "2");
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.move(saga, first, new MoveSagaVolumeRequest(3, "3"))));
            var b = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.move(saga, third, new MoveSagaVolumeRequest(1, "3"))));
            try {
                await(ready);
            } finally {
                go.countDown();
            }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("ok", "SAGA_REVISION_CONFLICT");
        }

        var confirmed = volumeService.findAll(saga);
        assertThat(confirmed.revision()).isEqualTo("4");
        assertThat(confirmed.volumes()).extracting(SagaDtos.SagaVolumeResponse::position)
            .containsExactly(1, 2, 3);
    }

    @Test
    void simultaneousNoOpMovesBothSucceedWithoutIncrementingRevision() throws Exception {
        long saga = saga();
        long first = pendingId(saga, "A", "0");
        pendingId(saga, "B", "1");
        pendingId(saga, "C", "2");
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.move(saga, first, new MoveSagaVolumeRequest(1, "3"))));
            var b = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.move(saga, first, new MoveSagaVolumeRequest(1, "3"))));
            try {
                await(ready);
            } finally {
                go.countDown();
            }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactly("ok", "ok");
        }

        assertThat(volumeService.findAll(saga).revision()).isEqualTo("3");
    }

    @Test
    void appendingWhileTheBookIsDeletedLeavesNoOrphansOrBrokenPositions() throws Exception {
        long saga = saga();
        long book = book("Libro en disputa");
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var add = pool.submit(() -> concurrent(ready, go,
                () -> volumeService.add(saga, new AddSagaVolumeRequest(book, null, null, "0"))));
            var delete = pool.submit(() -> {
                ready.countDown();
                await(go);
                bookService.delete(book);
                return "deleted";
            });
            try {
                await(ready);
            } finally {
                go.countDown();
            }
            assertThat(add.get(15, TimeUnit.SECONDS))
                .isIn("ok", "SAGA_BOOK_NOT_FOUND", "DATA_INTEGRITY");
            assertThat(delete.get(15, TimeUnit.SECONDS)).isEqualTo("deleted");
        }

        assertThat(books.existsById(book)).isFalse();
        var confirmed = volumeService.findAll(saga);
        assertThat(confirmed.revision()).isIn("0", "2");
        assertThat(confirmed.volumes()).hasSizeLessThanOrEqualTo(1);
        for (int index = 0; index < confirmed.volumes().size(); index++) {
            var volume = confirmed.volumes().get(index);
            assertThat(volume.position()).isEqualTo(index + 1);
            assertThat(volume.bookId()).isNull();
            assertThat(volume.pendingTitle()).isEqualTo("Libro en disputa");
        }
    }

    @Test
    void bookDeletionAndSagaDetachRollBackTogether() {
        long saga = saga();
        long book = book("Libro conservado");
        long volumeId = volumeService.add(saga,
            new AddSagaVolumeRequest(book, null, null, "0")).volume().id();

        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            bookService.delete(book);
            throw new IllegalStateException("rollback after actual Book deletion");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(books.existsById(book)).isTrue();
        var confirmed = volumeService.findAll(saga);
        assertThat(confirmed.revision()).isEqualTo("1");
        assertThat(confirmed.volumes()).hasSize(1);
        assertThat(confirmed.volumes().getFirst().id()).isEqualTo(volumeId);
        assertThat(confirmed.volumes().getFirst().bookId()).isEqualTo(book);
    }

    private String concurrent(CountDownLatch ready, CountDownLatch go, Runnable operation) throws Exception {
        ready.countDown();
        await(go);
        try {
            operation.run();
            return "ok";
        } catch (SagaException exception) {
            return exception.code();
        } catch (DataAccessException exception) {
            // The FK is the final authority when a concurrent book deletion beats the pre-check.
            return "DATA_INTEGRITY";
        }
    }

    private long saga() {
        return sagaService.create(new SagaRequest("Saga " + System.nanoTime(), null, null, null)).id();
    }

    private long pendingId(long saga, String title, String revision) {
        return volumeService.add(saga, new AddSagaVolumeRequest(null, title, null, revision)).volume().id();
    }

    private long book(String title) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Autora");
        book.setReadingStatus(ReadingStatus.READ);
        long id = books.saveAndFlush(book).getId();
        createdBooks.add(id);
        return id;
    }

    private static void await(CountDownLatch latch) throws InterruptedException {
        assertThat(latch.await(10, TimeUnit.SECONDS)).as("transaction coordination deadline").isTrue();
    }
}

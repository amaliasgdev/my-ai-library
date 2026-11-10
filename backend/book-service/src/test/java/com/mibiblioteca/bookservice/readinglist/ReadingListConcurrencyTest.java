package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.reset;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real commits and independent connections; latches control interleavings, never sleeps. */
@SpringBootTest
class ReadingListConcurrencyTest {
    @Autowired private ReadingListService service;
    @Autowired private BookService bookService;
    @Autowired private BookRepository books;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private jakarta.persistence.EntityManager entityManager;
    @MockitoSpyBean private ReadingListRepository lists;
    @MockitoSpyBean private ReadingListEntryRepository entries;
    private final List<Long> createdBooks = new ArrayList<>();

    @BeforeEach
    void resetList() {
        jdbc.update("DELETE FROM public.reading_list_entry");
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @AfterEach
    void cleanCommittedFixtures() {
        reset(lists, entries);
        jdbc.update("DELETE FROM public.reading_list_entry");
        for (long id : createdBooks) jdbc.update("DELETE FROM public.book WHERE id=?", id);
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @Test
    void simultaneousAppendsWithSameRevisionProduceOneCommitAndOneConflict() throws Exception {
        long first = book();
        long second = book();
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrentAdd(first, ready, go));
            var b = pool.submit(() -> concurrentAdd(second, ready, go));
            try { await(ready); } finally { go.countDown(); }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("created", "READING_LIST_REVISION_CONFLICT");
        }
        var result = service.getList(null);
        assertThat(result.revision()).isEqualTo("1");
        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().position()).isEqualTo(1);
    }

    @Test
    void simultaneousRemovalsNeverDoubleCompactOrDoubleIncrement() throws Exception {
        long entry = service.add(request(book(), "0")).item().entryId();
        service.add(request(book(), "1"));
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> remove = () -> {
                ready.countDown(); await(go);
                try { service.remove(entry, "2"); return "removed"; }
                catch (ReadingListException exception) { return exception.code(); }
            };
            var a = pool.submit(remove);
            var b = pool.submit(remove);
            try { await(ready); } finally { go.countDown(); }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("removed", "READING_LIST_REVISION_CONFLICT");
        }
        assertThat(service.getList(null).revision()).isEqualTo("3");
        assertThat(service.getList(null).items()).extracting(ReadingListDtos.ReadingListItemResponse::position).containsExactly(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "filtered", "membership"})
    void readKeepsOneSnapshotWhenWriterCommitsBetweenRevisionAndEntries(String kind) throws Exception {
        long id = book();
        var snapshotRead = new CountDownLatch(1);
        var proceed = new CountDownLatch(1);
        var first = new AtomicBoolean(true);
        doAnswer(invocation -> {
            // Spring Data proxy methods are abstract to Mockito. Execute the
            // actual SELECT through this thread's transactional EntityManager.
            Object result = java.util.Optional.ofNullable(entityManager.find(ReadingList.class, ReadingList.SINGLETON_ID));
            if (first.compareAndSet(true, false)) {
                snapshotRead.countDown();
                await(proceed);
            }
            return result;
        }).when(lists).findById(ReadingList.SINGLETON_ID);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var read = pool.submit(() -> kind.equals("membership")
                ? service.membership(List.of(id)) : service.getList(kind.equals("filtered") ? ReadingStatus.READ : null));
            try {
                await(snapshotRead);
                service.add(request(id, "0"));
            } finally { proceed.countDown(); }
            Object result = read.get(15, TimeUnit.SECONDS);
            if (result instanceof ReadingListDtos.ReadingListResponse list) {
                assertThat(list.revision()).isEqualTo("0");
                assertThat(list.items()).isEmpty();
                assertThat(list.totalItems()).isZero();
            } else {
                var membership = (ReadingListDtos.ReadingListMembershipResponse) result;
                assertThat(membership.revision()).isEqualTo("0");
                assertThat(membership.items().getFirst().included()).isFalse();
            }
        }
        assertThat(service.getList(null).revision()).isEqualTo("1");
        assertThat(service.getList(null).items()).hasSize(1);
    }

    @Test
    void failureAfterInsertFlushRollsBackEntryAndRevision() {
        long id = book();
        doAnswer(invocation -> {
            entityManager.persist(invocation.getArgument(0));
            entityManager.flush();
            throw new DataIntegrityViolationException("simulated failure after actual INSERT");
        }).when(entries).saveAndFlush(any(ReadingListEntry.class));
        assertThatThrownBy(() -> service.add(request(id, "0"))).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(service.getList(null).revision()).isEqualTo("0");
        assertThat(service.getList(null).items()).isEmpty();
        assertThat(books.existsById(id)).isTrue();
    }

    @Test
    void failureAfterDeleteCompactionAndRevisionFlushRollsBackAllChanges() {
        var first = service.add(request(book(), "0"));
        service.add(request(book(), "1"));
        service.add(request(book(), "2"));
        var before = service.getList(null);
        doAnswer(invocation -> {
            entityManager.flush();
            // A real PostgreSQL CHECK failure after DELETE, compaction and revision flush.
            jdbc.update("UPDATE public.reading_list SET revision=-1 WHERE id=1");
            return null;
        }).when(lists).flush();
        assertThatThrownBy(() -> service.remove(first.item().entryId(), "3")).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(service.getList(null)).isEqualTo(before);
    }

    @Test
    void actualDuplicateConstraintIsAListConflictNotAnIsbnConflict() {
        long id = book();
        service.add(request(id, "0"));
        // Model a stale precheck; the real named PostgreSQL UNIQUE remains authoritative.
        doReturn(false).when(entries).existsByReadingListIdAndBookId(ReadingList.SINGLETON_ID, id);
        assertThatThrownBy(() -> service.add(request(id, "1")))
            .isInstanceOfSatisfying(DataIntegrityViolationException.class, exception -> {
                var problem = new com.mibiblioteca.bookservice.common.exception.GlobalExceptionHandler().handlePersistence(exception);
                assertThat(problem.getStatus()).isEqualTo(409);
                assertThat(problem.getProperties()).containsEntry("code", "READING_LIST_ALREADY_CONTAINS_BOOK");
            });
        assertThat(service.getList(null).revision()).isEqualTo("1");
        assertThat(service.getList(null).items()).hasSize(1);
    }

    @Test
    void bookDeletionAndListChangeRollbackTogether() {
        long id = book();
        service.add(request(id, "0"));
        service.add(request(book(), "1"));
        var before = service.getList(null);
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            bookService.delete(id);
            books.flush();
            throw new IllegalStateException("rollback after actual Book deletion");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(books.existsById(id)).isTrue();
        assertThat(service.getList(null)).isEqualTo(before);
    }

    @Test
    void appendRacingWithBookDeletionLeavesNoOrphansOrPositionGaps() throws Exception {
        long id = book();
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var add = pool.submit(() -> concurrentAdd(id, ready, go));
            var delete = pool.submit(() -> { ready.countDown(); await(go); bookService.delete(id); return true; });
            try { await(ready); } finally { go.countDown(); }
            assertThat(add.get(15, TimeUnit.SECONDS)).isIn("created", "READING_LIST_BOOK_NOT_FOUND");
            assertThat(delete.get(15, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(books.existsById(id)).isFalse();
        var result = service.getList(null);
        assertThat(result.items()).isEmpty();
        assertThat(result.revision()).isIn("0", "2");
    }

    @Test
    void revisionExhaustionIsAConflictAndRollsBackTheInsertedEntry() {
        long id = book();
        jdbc.update("UPDATE public.reading_list SET revision=? WHERE id=1", Long.MAX_VALUE);
        assertThatThrownBy(() -> service.add(request(id, Long.toString(Long.MAX_VALUE))))
            .isInstanceOfSatisfying(ReadingListException.class,
                exception -> assertThat(exception.code()).isEqualTo("READING_LIST_REVISION_EXHAUSTED"));
        assertThat(service.getList(null).items()).isEmpty();
        assertThat(service.getList(null).revision()).isEqualTo(Long.toString(Long.MAX_VALUE));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void simultaneousEffectiveMovesCommitOnceAndRejectTheStaleWriter(boolean sameEntry) throws Exception {
        long first = service.add(request(book(), "0")).item().entryId();
        long second = service.add(request(book(), "1")).item().entryId();
        long third = service.add(request(book(), "2")).item().entryId();
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrentOperation(ready, go,
                () -> service.move(first, moveRequest(3, "3")), "moved"));
            var b = pool.submit(() -> concurrentOperation(ready, go,
                () -> service.move(sameEntry ? first : third, moveRequest(sameEntry ? 2 : 1, "3")), "moved"));
            try { await(ready); } finally { go.countDown(); }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("moved", "READING_LIST_REVISION_CONFLICT");
        }
        var confirmed = service.getList(null);
        assertThat(confirmed.revision()).isEqualTo("4");
        assertThat(confirmed.items()).extracting(ReadingListDtos.ReadingListItemResponse::position).containsExactly(1, 2, 3);
        var order = confirmed.items().stream().map(ReadingListDtos.ReadingListItemResponse::entryId).toList();
        assertThat(order).isIn(List.of(second, third, first), sameEntry ? List.of(second, first, third) : List.of(third, first, second));
    }

    @ParameterizedTest
    @ValueSource(strings = {"append", "remove", "deleteBook"})
    void movesCoordinateWithEveryOtherStructuralWrite(String operation) throws Exception {
        long firstBook = book();
        long middleBook = book();
        long lastBook = book();
        long appendedBook = book();
        long first = service.add(request(firstBook, "0")).item().entryId();
        long middle = service.add(request(middleBook, "1")).item().entryId();
        service.add(request(lastBook, "2"));
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        String moved;
        String other;
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> concurrentOperation(ready, go,
                () -> service.move(first, moveRequest(3, "3")), "moved"));
            var b = pool.submit(() -> concurrentOperation(ready, go, () -> {
                switch (operation) {
                    case "append" -> service.add(request(appendedBook, "3"));
                    case "remove" -> service.remove(middle, "3");
                    case "deleteBook" -> bookService.delete(middleBook);
                    default -> throw new AssertionError(operation);
                }
            }, "written"));
            try { await(ready); } finally { go.countDown(); }
            moved = a.get(15, TimeUnit.SECONDS);
            other = b.get(15, TimeUnit.SECONDS);
        }
        var confirmed = service.getList(null);
        assertThat(confirmed.items()).extracting(ReadingListDtos.ReadingListItemResponse::position)
            .containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, confirmed.items().size()).boxed().toList());
        if (operation.equals("deleteBook")) {
            assertThat(other).isEqualTo("written");
            assertThat(moved).isIn("moved", "READING_LIST_REVISION_CONFLICT");
            assertThat(confirmed.revision()).isEqualTo(moved.equals("moved") ? "5" : "4");
            assertThat(confirmed.items()).hasSize(2);
            assertThat(books.existsById(middleBook)).isFalse();
        } else {
            assertThat(List.of(moved, other)).containsExactlyInAnyOrder(
                moved.equals("moved") ? "moved" : "written", "READING_LIST_REVISION_CONFLICT");
            assertThat(confirmed.revision()).isEqualTo("4");
            int size = moved.equals("moved") ? 3 : operation.equals("append") ? 4 : 2;
            assertThat(confirmed.items()).hasSize(size);
            assertThat(books.existsById(middleBook)).isTrue();
        }
    }

    @Test
    void concurrentNoOpsBothSucceedWithoutIncrementingRevision() throws Exception {
        long entry = service.add(request(book(), "0")).item().entryId();
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> move = () -> concurrentOperation(ready, go,
                () -> assertThat(service.move(entry, moveRequest(1, "1")).revision()).isEqualTo("1"), "unchanged");
            var a = pool.submit(move);
            var b = pool.submit(move);
            try { await(ready); } finally { go.countDown(); }
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                .containsExactly("unchanged", "unchanged");
        }
        assertThat(service.getList(null).revision()).isEqualTo("1");
    }

    @Test
    void failureAfterActualMoveAndRevisionFlushRollsBackTheWholeInterval() {
        long first = service.add(request(book(), "0")).item().entryId();
        service.add(request(book(), "1"));
        service.add(request(book(), "2"));
        var before = service.getList(null);
        doAnswer(invocation -> {
            entityManager.flush();
            jdbc.update("UPDATE public.reading_list SET revision=-1 WHERE id=1");
            return null;
        }).when(lists).flush();
        assertThatThrownBy(() -> service.move(first, moveRequest(3, "3")))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(service.getList(null)).isEqualTo(before);
    }

    @Test
    void unresolvedDeferredPositionCollisionFailsAndRollsBackBeforeReturning() {
        long first = service.add(request(book(), "0")).item().entryId();
        service.add(request(book(), "1"));
        long third = service.add(request(book(), "2")).item().entryId();
        var before = service.getList(null);
        doAnswer(invocation -> entityManager.createQuery("""
            select entry from ReadingListEntry entry
            where entry.readingList.id = 1 and entry.id <> :omitted order by entry.position
            """, ReadingListEntry.class).setParameter("omitted", first).getResultList())
            .when(entries).findByReadingListIdAndPositionBetweenOrderByPositionAsc(ReadingList.SINGLETON_ID, 1, 3);
        // Simulate an incomplete interval from storage: position 1 is not shifted,
        // so the actual deferred UNIQUE must reject the moved entry at position 1.
        assertThatThrownBy(() -> service.move(third, moveRequest(1, "3")))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(service.getList(null)).isEqualTo(before);
    }

    @Test
    void effectiveMoveAtMaximumRevisionRollsBackWithoutChangingOrder() {
        long first = service.add(request(book(), "0")).item().entryId();
        service.add(request(book(), "1"));
        jdbc.update("UPDATE public.reading_list SET revision=? WHERE id=1", Long.MAX_VALUE);
        var before = service.getList(null);
        assertThatThrownBy(() -> service.move(first, moveRequest(2, Long.toString(Long.MAX_VALUE))))
            .isInstanceOfSatisfying(ReadingListException.class,
                exception -> assertThat(exception.code()).isEqualTo("READING_LIST_REVISION_EXHAUSTED"));
        assertThat(service.getList(null)).isEqualTo(before);
    }

    private String concurrentOperation(CountDownLatch ready, CountDownLatch go, Runnable operation, String success) throws Exception {
        ready.countDown(); await(go);
        try { operation.run(); return success; }
        catch (ReadingListException exception) { return exception.code(); }
    }

    private ReadingListDtos.MoveReadingListItemRequest moveRequest(int position, String revision) {
        return new ReadingListDtos.MoveReadingListItemRequest(position, revision);
    }

    private String concurrentAdd(long id, CountDownLatch ready, CountDownLatch go) throws Exception {
        ready.countDown(); await(go);
        try { service.add(request(id, "0")); return "created"; }
        catch (ReadingListException exception) { return exception.code(); }
    }

    private static void await(CountDownLatch latch) throws InterruptedException {
        assertThat(latch.await(10, TimeUnit.SECONDS)).as("transaction coordination deadline").isTrue();
    }

    private ReadingListDtos.AddReadingListItemRequest request(long id, String revision) {
        return new ReadingListDtos.AddReadingListItemRequest(id, revision);
    }

    private long book() {
        Book book = new Book(); book.setTitle("Concurrency fixture"); book.setAuthor("Author"); book.setReadingStatus(ReadingStatus.READ);
        long id = books.saveAndFlush(book).getId();
        createdBooks.add(id);
        return id;
    }
}

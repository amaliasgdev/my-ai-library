package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import jakarta.persistence.EntityManager;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class ReadingListPersistenceTest {
    @Autowired private ReadingListRepository lists;
    @Autowired private ReadingListEntryRepository entries;
    @Autowired private BookRepository books;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;

    @Test
    void mapsTheInitialSingletonAndPersistsItsExplicitRevision() {
        ReadingList list = list();
        assertThat(list.getRevision()).isZero();
        list.setRevision(7);
        lists.flush();
        entityManager.clear();
        assertThat(list().getRevision()).isEqualTo(7);
    }

    @Test
    void persistsEntriesAndLoadsConsecutivePositionsWithCurrentBookData() {
        Book first = book("Primero");
        Book second = book("Segundo");
        Instant addedAt = Instant.parse("2026-11-09T12:00:00Z");
        entries.saveAndFlush(new ReadingListEntry(list(), second, 2, addedAt));
        entries.saveAndFlush(new ReadingListEntry(list(), first, 1, addedAt));
        first.setReadingStatus(ReadingStatus.READ);
        first.setStartedOn(LocalDate.of(2026, 1, 1));
        first.setFinishedOn(LocalDate.of(2026, 2, 2));
        books.flush();
        entityManager.clear();
        var loaded = entries.findByReadingListIdOrderByPositionAsc(ReadingList.SINGLETON_ID);
        assertThat(loaded).extracting(ReadingListEntry::getPosition).containsExactly(1, 2);
        assertThat(loaded).allSatisfy(entry -> {
            assertThat(entry.getId()).isPositive();
            assertThat(entry.getAddedAt()).isEqualTo(addedAt);
            assertThat(entityManager.getEntityManagerFactory().getPersistenceUnitUtil().isLoaded(entry, "book")).isTrue();
        });
        assertThat(loaded.getFirst().getBook().getId()).isEqualTo(first.getId());
        assertThat(loaded.getFirst().getBook().getReadingStatus()).isEqualTo(ReadingStatus.READ);
        assertThat(loaded.getFirst().getBook().getFinishedOn()).isEqualTo(LocalDate.of(2026, 2, 2));
    }

    @Test
    void deletingAnEntryDoesNotDeleteItsBookOrList() {
        Book book = book("Conservado");
        ReadingListEntry entry = entry(book, 1);
        entries.delete(entry);
        entries.flush();
        entityManager.clear();
        assertThat(entries.findById(entry.getId())).isEmpty();
        assertThat(books.findById(book.getId())).isPresent();
        assertThat(lists.findById(ReadingList.SINGLETON_ID)).isPresent();
    }

    @Test
    void deletingABookCascadesOnlyToItsEntry() {
        Book removed = book("Eliminado");
        Book kept = book("Conservado");
        ReadingListEntry removedEntry = entry(removed, 1);
        ReadingListEntry keptEntry = entry(kept, 2);
        // As in the existing Book delete request, start without managed entry
        // objects pointing at a Book that is about to be removed by the database.
        entityManager.clear();
        books.deleteById(removed.getId());
        books.flush();
        entityManager.clear();
        assertThat(entries.findById(removedEntry.getId())).isEmpty();
        assertThat(entries.findById(keptEntry.getId())).isPresent();
        assertThat(books.findById(kept.getId())).isPresent();
        assertThat(lists.findById(ReadingList.SINGLETON_ID)).isPresent();
    }

    @Test
    void rejectsADuplicateBookAtADifferentPosition() {
        Book book = book("Único");
        entry(book, 1);
        assertThatThrownBy(() -> entry(book, 2)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsADuplicatePositionForDifferentBooks() {
        entry(book("Primero"), 1);
        Book second = book("Segundo");
        assertThatThrownBy(() -> entry(second, 1)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "UPDATE public.reading_list SET revision=-1 WHERE id=1",
        "UPDATE public.reading_list SET revision=NULL WHERE id=1",
        "INSERT INTO public.reading_list(id) VALUES (2)",
        "INSERT INTO public.reading_list(id) VALUES (1)",
        "UPDATE public.reading_list_entry SET position=0",
        "UPDATE public.reading_list_entry SET position=-1",
        "UPDATE public.reading_list_entry SET position=NULL",
        "UPDATE public.reading_list_entry SET book_id=-1",
        "UPDATE public.reading_list_entry SET book_id=NULL",
        "UPDATE public.reading_list_entry SET reading_list_id=2",
        "UPDATE public.reading_list_entry SET reading_list_id=NULL",
        "UPDATE public.reading_list_entry SET added_at=NULL",
        "DELETE FROM public.reading_list WHERE id=1"
    })
    void enforcesChecksNotNullForeignKeysAndSingleton(String sql) {
        entry(book("Libro"), 1);
        assertThatThrownBy(() -> jdbc.execute(sql)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deferrableUniquenessAllowsAnAtomicPositionSwap() {
        ReadingListEntry first = entry(book("Primero"), 1);
        ReadingListEntry second = entry(book("Segundo"), 2);
        jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position DEFERRED");
        first.setPosition(2);
        second.setPosition(1);
        entries.flush();
        jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position IMMEDIATE");
        entityManager.clear();
        assertThat(entries.findByReadingListIdOrderByPositionAsc(ReadingList.SINGLETON_ID))
            .extracting(ReadingListEntry::getId).containsExactly(second.getId(), first.getId());
    }

    @Test
    void deferredDuplicateStillFailsAtTheFinalConstraintCheck() {
        ReadingListEntry first = entry(book("Primero"), 1);
        entry(book("Segundo"), 2);
        jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position DEFERRED");
        first.setPosition(2);
        entries.flush();
        assertThatThrownBy(() -> jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position IMMEDIATE"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void singletonLockExcludesASecondWriterUntilTheTransactionEnds() throws Exception {
        assertThat(lists.findSingletonForUpdate()).isPresent();
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.execute("SET LOCAL lock_timeout='200ms'");
                assertThatThrownBy(() -> statement.executeQuery("SELECT id FROM public.reading_list WHERE id=1 FOR UPDATE"))
                    .isInstanceOfSatisfying(SQLException.class, exception -> assertThat(exception.getSQLState()).isEqualTo("55P03"));
            } finally {
                connection.rollback();
            }
        }
    }

    private ReadingList list() {
        return lists.findById(ReadingList.SINGLETON_ID).orElseThrow();
    }

    private Book book(String title) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor("Autora");
        return books.saveAndFlush(book);
    }

    private ReadingListEntry entry(Book book, int position) {
        return entries.saveAndFlush(new ReadingListEntry(list(), book, position, Instant.now()));
    }
}

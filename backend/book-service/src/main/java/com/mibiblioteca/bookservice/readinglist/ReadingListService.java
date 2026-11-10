package com.mibiblioteca.bookservice.readinglist;

import static com.mibiblioteca.bookservice.readinglist.ReadingList.SINGLETON_ID;
import static com.mibiblioteca.bookservice.readinglist.ReadingListDtos.*;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookResponseMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReadingListService {
    private final ReadingListRepository lists;
    private final ReadingListEntryRepository entries;
    private final BookRepository books;
    private final BookResponseMapper mapper;
    private final JdbcTemplate jdbc;

    public ReadingListService(ReadingListRepository lists, ReadingListEntryRepository entries,
                              BookRepository books, BookResponseMapper mapper, JdbcTemplate jdbc) {
        this.lists = lists;
        this.entries = entries;
        this.books = books;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReadingListResponse getList(ReadingStatus status) {
        ReadingList list = lists.findById(SINGLETON_ID).orElseThrow();
        var selected = status == null ? entries.findByReadingListIdOrderByPositionAsc(SINGLETON_ID)
            : entries.findByReadingListIdAndBookReadingStatusOrderByPositionAsc(SINGLETON_ID, status);
        long total = status == null ? selected.size() : entries.countByReadingListId(SINGLETON_ID);
        return new ReadingListResponse(Long.toString(list.getRevision()), total, selected.stream().map(this::item).toList());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReadingListMembershipResponse membership(List<Long> bookIds) {
        ReadingList list = lists.findById(SINGLETON_ID).orElseThrow();
        var membership = new HashMap<Long, Long>();
        entries.findMembership(bookIds).forEach(row -> membership.put(row.getBookId(), row.getEntryId()));
        return new ReadingListMembershipResponse(Long.toString(list.getRevision()), bookIds.stream()
            .map(id -> new ReadingListMembershipItem(id, membership.containsKey(id), membership.get(id))).toList());
    }

    @Transactional
    public ReadingListAddResponse add(AddReadingListItemRequest request) {
        long expected = ReadingListParameters.revision(request.expectedRevision());
        ReadingList list = lockAndCheck(expected);
        var book = books.findForReadingList(request.bookId()).orElseThrow(() ->
            new ReadingListException(HttpStatus.NOT_FOUND, "READING_LIST_BOOK_NOT_FOUND", "The book does not exist", "bookId"));
        if (entries.existsByReadingListIdAndBookId(SINGLETON_ID, book.getId())) throw ReadingListException.duplicate();
        long size = entries.countByReadingListId(SINGLETON_ID);
        if (size >= Integer.MAX_VALUE) throw new ReadingListException(HttpStatus.CONFLICT,
            "READING_LIST_CAPACITY_EXCEEDED", "The reading list cannot hold more entries", null);
        var entry = entries.saveAndFlush(new ReadingListEntry(list, book, (int) size + 1, Instant.now().truncatedTo(ChronoUnit.MICROS)));
        increment(list);
        lists.flush();
        return new ReadingListAddResponse(Long.toString(list.getRevision()), item(entry));
    }

    @Transactional
    public ReadingListRevisionResponse remove(long entryId, String expectedRevision) {
        ReadingList list = lockAndCheck(ReadingListParameters.revision(expectedRevision));
        var entry = entries.findByIdAndReadingListId(entryId, SINGLETON_ID).orElseThrow(() ->
            new ReadingListException(HttpStatus.NOT_FOUND, "READING_LIST_ENTRY_NOT_FOUND", "The entry does not exist", "entryId"));
        removeAndCompact(list, entry);
        return new ReadingListRevisionResponse(Long.toString(list.getRevision()));
    }

    @Transactional
    public ReadingListMoveResponse move(long entryId, MoveReadingListItemRequest request) {
        ReadingList list = lockAndCheck(ReadingListParameters.revision(request.expectedRevision()));
        var entry = entries.findByIdAndReadingListId(entryId, SINGLETON_ID).orElseThrow(() ->
            new ReadingListException(HttpStatus.NOT_FOUND, "READING_LIST_ENTRY_NOT_FOUND", "The entry does not exist", "entryId"));
        Integer target = request.toPosition();
        if (target == null || target < 1 || target > entries.countByReadingListId(SINGLETON_ID))
            throw ReadingListException.invalid("toPosition");
        int previous = entry.getPosition();
        if (target != previous) {
            jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position DEFERRED");
            // Fetch before changing managed positions: query auto-flush must not
            // influence which rows belong to the original affected interval.
            var affected = entries.findByReadingListIdAndPositionBetweenOrderByPositionAsc(
                SINGLETON_ID, Math.min(previous, target), Math.max(previous, target));
            int shift = target < previous ? 1 : -1;
            affected.stream().filter(other -> !other.getId().equals(entry.getId()))
                .forEach(other -> other.setPosition(other.getPosition() + shift));
            entry.setPosition(target);
            increment(list);
            lists.flush();
            jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position IMMEDIATE");
        }
        return new ReadingListMoveResponse(Long.toString(list.getRevision()), entry.getId(), entry.getPosition());
    }

    /** Joins Book.delete's transaction; always acquire the singleton before Book. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void removeBookBeforeDeletion(long bookId) {
        ReadingList list = lists.findSingletonForUpdate().orElseThrow();
        entries.findByReadingListIdAndBookId(SINGLETON_ID, bookId).ifPresent(entry -> removeAndCompact(list, entry));
    }

    private ReadingList lockAndCheck(long expected) {
        ReadingList list = lists.findSingletonForUpdate().orElseThrow();
        if (list.getRevision() != expected) throw new ReadingListException(HttpStatus.CONFLICT,
            "READING_LIST_REVISION_CONFLICT", "The reading list changed; reload before writing", "expectedRevision");
        return list;
    }

    private void removeAndCompact(ReadingList list, ReadingListEntry entry) {
        jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position DEFERRED");
        int position = entry.getPosition();
        entries.delete(entry);
        entries.findByReadingListIdAndPositionGreaterThanOrderByPositionAsc(SINGLETON_ID, position)
            .forEach(later -> later.setPosition(later.getPosition() - 1));
        increment(list);
        lists.flush();
        jdbc.execute("SET CONSTRAINTS public.uq_reading_list_entry_position IMMEDIATE");
    }

    private void increment(ReadingList list) {
        if (list.getRevision() == Long.MAX_VALUE) throw new ReadingListException(HttpStatus.CONFLICT,
            "READING_LIST_REVISION_EXHAUSTED", "The reading list revision cannot be incremented", null);
        list.setRevision(list.getRevision() + 1);
    }

    private ReadingListItemResponse item(ReadingListEntry entry) {
        return new ReadingListItemResponse(entry.getId(), entry.getPosition(), entry.getAddedAt(), mapper.toResponse(entry.getBook()));
    }
}

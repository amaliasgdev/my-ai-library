package com.mibiblioteca.bookservice.readinglist;

import java.util.List;
import java.util.Optional;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReadingListEntryRepository extends JpaRepository<ReadingListEntry, Long> {
    @EntityGraph(attributePaths = "book")
    List<ReadingListEntry> findByReadingListIdOrderByPositionAsc(Long readingListId);

    @EntityGraph(attributePaths = "book")
    List<ReadingListEntry> findByReadingListIdAndBookReadingStatusOrderByPositionAsc(
        Long readingListId, ReadingStatus readingStatus);

    long countByReadingListId(Long readingListId);

    boolean existsByReadingListIdAndBookId(Long readingListId, Long bookId);

    Optional<ReadingListEntry> findByReadingListIdAndBookId(Long readingListId, Long bookId);

    Optional<ReadingListEntry> findByIdAndReadingListId(Long id, Long readingListId);

    List<ReadingListEntry> findByReadingListIdAndPositionGreaterThanOrderByPositionAsc(Long readingListId, int position);

    interface Membership {
        Long getBookId();
        Long getEntryId();
    }

    @Query("""
        select entry.book.id as bookId, entry.id as entryId from ReadingListEntry entry
        where entry.readingList.id = 1 and entry.book.id in :bookIds
        """)
    List<Membership> findMembership(@Param("bookIds") List<Long> bookIds);
}

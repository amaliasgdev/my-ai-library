package com.mibiblioteca.bookservice.readinglist;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReadingListEntryRepository extends JpaRepository<ReadingListEntry, Long> {
    @EntityGraph(attributePaths = "book")
    List<ReadingListEntry> findByReadingListIdOrderByPositionAsc(Long readingListId);
}

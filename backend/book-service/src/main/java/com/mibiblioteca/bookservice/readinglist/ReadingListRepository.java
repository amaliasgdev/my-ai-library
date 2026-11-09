package com.mibiblioteca.bookservice.readinglist;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface ReadingListRepository extends JpaRepository<ReadingList, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select list from ReadingList list where list.id = 1")
    Optional<ReadingList> findSingletonForUpdate();
}

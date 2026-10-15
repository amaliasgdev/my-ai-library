package com.mibiblioteca.bookservice.inventory;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import static com.mibiblioteca.bookservice.inventory.InventorySessionDtos.*;

public interface InventorySessionRepository extends JpaRepository<InventorySession, Long> {
    @Override @EntityGraph(attributePaths = {"shelf", "shelf.bookcase", "shelf.bookcase.room"})
    Optional<InventorySession> findById(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from InventorySession s where s.id = :id")
    Optional<InventorySession> lockById(Long id);

    @Query("select new com.mibiblioteca.bookservice.inventory.InventorySessionDtos$InventorySessionSummary(s.id,s.status,s.notes,s.createdAt,s.updatedAt,s.startedAt,s.completedAt,s.cancelledAt) from InventorySession s where s.shelf.id = :shelfId")
    Page<InventorySessionSummary> history(Long shelfId, Pageable pageable);

    @Query("select new com.mibiblioteca.bookservice.inventory.InventorySessionDtos$InventorySessionSummary(s.id,s.status,s.notes,s.createdAt,s.updatedAt,s.startedAt,s.completedAt,s.cancelledAt) from InventorySession s where s.shelf.id = :shelfId and s.status = com.mibiblioteca.bookservice.inventory.InventorySessionStatus.IN_PROGRESS")
    Optional<InventorySessionSummary> active(Long shelfId);

    boolean existsByShelfId(Long shelfId);
    interface ShelfCount { Long getShelfId(); long getSessionCount(); }
    @Query("select s.shelf.id as shelfId, count(s) as sessionCount from InventorySession s group by s.shelf.id")
    List<ShelfCount> countByShelf();
}

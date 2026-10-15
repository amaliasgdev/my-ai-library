package com.mibiblioteca.bookservice.location;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;

public interface ShelfRepository extends JpaRepository<Shelf, Long> {
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_READ)
    @Query("select s from Shelf s where s.id = :id")
    Optional<Shelf> lockForInventory(Long id);
    boolean existsByBookcaseId(Long bookcaseId);
    @Override @EntityGraph(attributePaths = {"bookcase", "bookcase.room"})
    List<Shelf> findAll();
    @Override @EntityGraph(attributePaths = {"bookcase", "bookcase.room"})
    Optional<Shelf> findById(Long id);
}

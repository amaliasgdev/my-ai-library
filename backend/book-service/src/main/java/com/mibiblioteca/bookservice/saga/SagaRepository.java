package com.mibiblioteca.bookservice.saga;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface SagaRepository extends JpaRepository<Saga, Long> {

    /** Serializes every write for one saga so revisions cannot be lost. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select saga from Saga saga where saga.id = :id")
    Optional<Saga> findByIdForUpdate(@Param("id") Long id);

    Page<Saga> findByNameContainingIgnoreCase(String name, Pageable pageable);
}

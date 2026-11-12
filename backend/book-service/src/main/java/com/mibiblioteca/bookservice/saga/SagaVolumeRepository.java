package com.mibiblioteca.bookservice.saga;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SagaVolumeRepository extends JpaRepository<SagaVolume, Long> {

    List<SagaVolume> findBySagaIdOrderByPositionAsc(Long sagaId);

    @Query("select volume from SagaVolume volume left join fetch volume.book "
        + "where volume.saga.id = :sagaId order by volume.position")
    List<SagaVolume> findDetailedBySagaIdOrderByPosition(@Param("sagaId") Long sagaId);

    Optional<SagaVolume> findByIdAndSagaId(Long id, Long sagaId);

    Optional<SagaVolume> findBySagaIdAndBookId(Long sagaId, Long bookId);

    boolean existsBySagaIdAndBookId(Long sagaId, Long bookId);

    long countBySagaId(Long sagaId);

    List<SagaVolume> findBySagaIdAndPositionBetweenOrderByPositionAsc(Long sagaId, int from, int to);

    List<SagaVolume> findBySagaIdAndPositionGreaterThanOrderByPositionAsc(Long sagaId, int position);

    List<SagaVolume> findByBookIdOrderBySagaIdAsc(Long bookId);

    @Query("select volume from SagaVolume volume join fetch volume.saga saga "
        + "where volume.book.id = :bookId order by lower(saga.name), saga.id")
    List<SagaVolume> findByBookIdWithSagaOrderByName(@Param("bookId") Long bookId);

    @Query("select distinct volume.saga.id from SagaVolume volume where volume.book.id = :bookId")
    List<Long> findDistinctSagaIdsByBookId(@Param("bookId") Long bookId);

    /**
     * One aggregate for a whole saga page. Pending volumes count as total but not
     * as linked, read, reading, to-read or abandoned.
     */
    @Query(value = """
        SELECT sv.saga_id AS "sagaId",
               count(*) AS total,
               count(b.id) AS linked,
               count(*) FILTER (WHERE b.reading_status = 'READ') AS read,
               count(*) FILTER (WHERE b.reading_status = 'READING') AS reading,
               count(*) FILTER (WHERE b.reading_status = 'TO_READ') AS "toRead",
               count(*) FILTER (WHERE b.reading_status = 'ABANDONED') AS abandoned
          FROM public.saga_volume sv
          LEFT JOIN public.book b ON b.id = sv.book_id
         WHERE sv.saga_id IN (:sagaIds)
         GROUP BY sv.saga_id
        """, nativeQuery = true)
    List<Progress> findProgressBySagaIds(@Param("sagaIds") Collection<Long> sagaIds);

    interface Progress {
        Long getSagaId();

        long getTotal();

        long getLinked();

        long getRead();

        long getReading();

        long getToRead();

        long getAbandoned();
    }
}

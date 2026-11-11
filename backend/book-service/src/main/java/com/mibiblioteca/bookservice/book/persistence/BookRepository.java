package com.mibiblioteca.bookservice.book.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookRepository extends JpaRepository<Book, Long>, JpaSpecificationExecutor<Book> {
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select book from Book book where book.id = :id")
    Optional<Book> findForReadingList(@Param("id") Long id);

    boolean existsByIsbn(String isbn);

    boolean existsByIsbnAndIdNot(String isbn, Long id);

    /**
     * Case-insensitive (but accent-sensitive) distinct labels from the native PostgreSQL
     * varchar[] column. The representative spelling is deterministic, and empty entries
     * left by legacy data are ignored. No table, extension, migration or index is involved.
     */
    @Query(value = "SELECT min(btrim(genre.value)) FROM book b CROSS JOIN LATERAL unnest(b.genres) AS genre(value) " +
        "WHERE btrim(genre.value) <> '' GROUP BY lower(btrim(genre.value)) " +
        "ORDER BY lower(btrim(genre.value)), min(btrim(genre.value))", nativeQuery = true)
    List<String> findDistinctGenres();

}

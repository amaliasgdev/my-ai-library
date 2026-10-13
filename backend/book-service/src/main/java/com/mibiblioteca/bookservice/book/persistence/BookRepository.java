package com.mibiblioteca.bookservice.book.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.Optional;
import java.util.List;

public interface BookRepository extends JpaRepository<Book, Long>, JpaSpecificationExecutor<Book> {
    @Override
    @EntityGraph(attributePaths = {"assignedShelf", "assignedShelf.bookcase", "assignedShelf.bookcase.room"})
    Optional<Book> findById(Long id);

    @Override
    @EntityGraph(attributePaths = {"assignedShelf", "assignedShelf.bookcase", "assignedShelf.bookcase.room"})
    Page<Book> findAll(Specification<Book> specification, Pageable pageable);

    boolean existsByAssignedShelfId(Long shelfId);
    interface ShelfCount { Long getShelfId(); long getBookCount(); }
    @Query("select b.assignedShelf.id as shelfId, count(b) as bookCount from Book b where b.assignedShelf is not null group by b.assignedShelf.id")
    List<ShelfCount> countByShelf();
    boolean existsByIsbn(String isbn);

    boolean existsByIsbnAndIdNot(String isbn, Long id);

}

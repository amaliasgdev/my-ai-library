package com.mibiblioteca.bookservice.location;

import java.util.List;
import org.springframework.data.jpa.repository.*;

public interface BookcaseRepository extends JpaRepository<Bookcase, Long> {
    boolean existsByRoomId(Long roomId);
    @Override @EntityGraph(attributePaths = "room")
    List<Bookcase> findAll();
}

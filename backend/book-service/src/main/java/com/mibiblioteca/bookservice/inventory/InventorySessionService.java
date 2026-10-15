package com.mibiblioteca.bookservice.inventory;

import static com.mibiblioteca.bookservice.inventory.InventorySessionDtos.*;
import com.mibiblioteca.bookservice.location.Shelf;
import com.mibiblioteca.bookservice.location.ShelfRepository;
import java.time.Instant;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class InventorySessionService {
    private final InventorySessionRepository sessions;
    private final ShelfRepository shelves;
    public InventorySessionService(InventorySessionRepository sessions, ShelfRepository shelves) {
        this.sessions = sessions; this.shelves = shelves;
    }
    public InventorySessionResponse create(long shelfId, CreateInventorySessionRequest request) {
        Shelf shelf = shelves.lockForInventory(shelfId).orElseThrow(InventorySessionException::missing);
        var session = new InventorySession(shelf, normalize(request == null ? null : request.notes()), Instant.now());
        return response(sessions.saveAndFlush(session));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ShelfInventorySessionsResponse history(long shelfId, int page, int size) {
        Shelf shelf = shelves.findById(shelfId).orElseThrow(InventorySessionException::missing);
        var result = sessions.history(shelfId, PageRequest.of(page, size, Sort.by(Sort.Order.desc("startedAt"), Sort.Order.desc("id"))));
        return new ShelfInventorySessionsResponse(context(shelf), sessions.active(shelfId).orElse(null), result.getContent(), page, size, result.getTotalElements(), result.getTotalPages());
    }
    @Transactional(readOnly = true)
    public InventorySessionResponse get(long id) { return response(sessions.findById(id).orElseThrow(InventorySessionException::missing)); }
    public InventorySessionResponse complete(long id) { return close(id, InventorySessionStatus.COMPLETED); }
    public InventorySessionResponse cancel(long id) { return close(id, InventorySessionStatus.CANCELLED); }
    private InventorySessionResponse close(long id, InventorySessionStatus status) {
        var session = sessions.lockById(id).orElseThrow(InventorySessionException::missing);
        session.close(status, Instant.now());
        return response(sessions.saveAndFlush(session));
    }
    public InventorySessionResponse notes(long id, UpdateInventorySessionNotesRequest request) {
        var session = sessions.lockById(id).orElseThrow(InventorySessionException::missing);
        session.updateNotes(normalize(request.notes()), Instant.now());
        return response(sessions.saveAndFlush(session));
    }
    private String normalize(String notes) {
        if (notes == null) return null;
        if (notes.length() > 2000) throw new IllegalArgumentException("Notes exceed validated length");
        String result = notes.replaceAll("^[\\s\\p{Zs}\\uFEFF]+|[\\s\\p{Zs}\\uFEFF]+$", "");
        return result.isEmpty() ? null : result;
    }
    private InventoryShelfContext context(Shelf shelf) {
        var bookcase = shelf.getBookcase(); var room = bookcase.getRoom();
        return new InventoryShelfContext(room.getId(), room.getName(), bookcase.getId(), bookcase.getName(), shelf.getId(), shelf.getName());
    }
    private InventorySessionResponse response(InventorySession s) {
        return new InventorySessionResponse(s.getId(), context(s.getShelf()), s.getStatus(), s.getNotes(), s.getCreatedAt(), s.getUpdatedAt(), s.getStartedAt(), s.getCompletedAt(), s.getCancelledAt());
    }
}

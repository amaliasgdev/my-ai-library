package com.mibiblioteca.bookservice.location;

import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.validation.LocationLabelValidator;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.mibiblioteca.bookservice.location.LocationDtos.*;

@Service
@Transactional
public class LocationService {
    private final RoomRepository rooms;
    private final BookcaseRepository bookcases;
    private final ShelfRepository shelves;
    private final BookRepository books;
    private final com.mibiblioteca.bookservice.inventory.InventorySessionRepository inventory;
    public LocationService(RoomRepository rooms, BookcaseRepository bookcases, ShelfRepository shelves, BookRepository books, com.mibiblioteca.bookservice.inventory.InventorySessionRepository inventory) {
        this.inventory = inventory;
        this.rooms = rooms; this.bookcases = bookcases; this.shelves = shelves; this.books = books;
    }

    @Transactional(readOnly = true)
    public List<RoomNode> hierarchy() {
        Map<Long, Long> counts = new HashMap<>();
        Set<Long> inventoryShelves = new HashSet<>();
        for (var count : inventory.countByShelf()) inventoryShelves.add(count.getShelfId());
        for (var count : books.countByShelf()) counts.put(count.getShelfId(), count.getBookCount());
        var allShelves = shelves.findAll(); var allBookcases = bookcases.findAll();
        Comparator<Shelf> shelfOrder = Comparator.comparing(Shelf::getName).thenComparing(Shelf::getId);
        Comparator<Bookcase> caseOrder = Comparator.comparing(Bookcase::getName).thenComparing(Bookcase::getId);
        return rooms.findAll().stream().sorted(Comparator.comparing(Room::getName).thenComparing(Room::getId)).map(room -> {
            var children = allBookcases.stream().filter(b -> b.getRoom().getId().equals(room.getId())).sorted(caseOrder).map(bookcase -> {
                var nodes = allShelves.stream().filter(s -> s.getBookcase().getId().equals(bookcase.getId())).sorted(shelfOrder).map(s -> {
                    long count = counts.getOrDefault(s.getId(), 0L);
                    boolean history = inventoryShelves.contains(s.getId());
                    return new ShelfNode(s.getId(), s.getName(), count, count == 0 && !history, count > 0 ? "BOOKS" : history ? "INVENTORY_SESSIONS" : null);
                }).toList();
                return new BookcaseNode(bookcase.getId(), bookcase.getName(), nodes.stream().mapToLong(ShelfNode::bookCount).sum(), nodes.isEmpty(), nodes.isEmpty() ? null : "SHELVES", nodes);
            }).toList();
            return new RoomNode(room.getId(), room.getName(), children.stream().mapToLong(BookcaseNode::bookCount).sum(), children.isEmpty(), children.isEmpty() ? null : "BOOKCASES", children);
        }).toList();
    }

    public Item createRoom(String name) { Room room = new Room(); room.setName(name(name, 100)); return item(rooms.saveAndFlush(room)); }
    public Item renameRoom(Long id, String name) { Room room = room(id); room.setName(name(name, 100)); return item(rooms.saveAndFlush(room)); }
    public void deleteRoom(Long id) { Room room = room(id); if (bookcases.existsByRoomId(id)) throw LocationException.inUse(); rooms.delete(room); rooms.flush(); }
    public Item createBookcase(Long roomId, String name) {
        Bookcase bookcase = new Bookcase(); bookcase.setRoom(room(roomId)); bookcase.setName(name(name, 100));
        var saved = bookcases.saveAndFlush(bookcase); return new Item(saved.getId(), saved.getName());
    }
    public Item renameBookcase(Long id, String name) {
        var bookcase = bookcases.findById(id).orElseThrow(() -> LocationException.missing("bookcaseId"));
        bookcase.setName(name(name, 100)); bookcases.saveAndFlush(bookcase); return new Item(bookcase.getId(), bookcase.getName());
    }
    public void deleteBookcase(Long id) {
        var bookcase = bookcases.findById(id).orElseThrow(() -> LocationException.missing("bookcaseId"));
        if (shelves.existsByBookcaseId(id)) throw LocationException.inUse(); bookcases.delete(bookcase); bookcases.flush();
    }
    public Item createShelf(Long bookcaseId, String name) {
        var shelf = new Shelf(); shelf.setBookcase(bookcases.findById(bookcaseId).orElseThrow(() -> LocationException.missing("bookcaseId")));
        shelf.setName(name(name, 50)); var saved = shelves.saveAndFlush(shelf); return new Item(saved.getId(), saved.getName());
    }
    public Item renameShelf(Long id, String name) { var shelf = shelf(id); shelf.setName(name(name, 50)); shelves.saveAndFlush(shelf); return new Item(shelf.getId(), shelf.getName()); }
    public void deleteShelf(Long id) { var shelf = shelf(id); if (books.existsByAssignedShelfId(id) || inventory.existsByShelfId(id)) throw LocationException.inUse(); shelves.delete(shelf); shelves.flush(); }
    @Transactional(readOnly = true)
    public Shelf shelf(Long id) { return shelves.findById(id).orElseThrow(() -> LocationException.missing("location.shelfId")); }
    private Room room(Long id) { return rooms.findById(id).orElseThrow(() -> LocationException.missing("roomId")); }
    private Item item(Room room) { return new Item(room.getId(), room.getName()); }

    public String normalizeLabel(String value) {
        if (value == null) return null;
        String trimmed = value.replaceAll("^[\\p{Zs}\\uFEFF]+|[\\p{Zs}\\uFEFF]+$", "");
        return trimmed.isEmpty() ? null : trimmed;
    }
    private String name(String value, int max) {
        if (value == null || value.length() > max || !new LocationLabelValidator().isValid(value, null)) throw LocationException.invalid("name");
        String normalized = normalizeLabel(value);
        if (normalized == null) throw LocationException.invalid("name");
        return normalized;
    }
}

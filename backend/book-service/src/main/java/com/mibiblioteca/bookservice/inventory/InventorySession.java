package com.mibiblioteca.bookservice.inventory;

import com.mibiblioteca.bookservice.location.Shelf;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "inventory_session")
public class InventorySession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shelf_id", nullable = false, updatable = false)
    private Shelf shelf;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private InventorySessionStatus status;
    @Column(length = 2000) private String notes;
    @Column(nullable = false, updatable = false) private Instant createdAt;
    @Column(nullable = false) private Instant updatedAt;
    @Column(nullable = false, updatable = false) private Instant startedAt;
    private Instant completedAt;
    private Instant cancelledAt;

    protected InventorySession() {}
    public InventorySession(Shelf shelf, String notes, Instant now) {
        this.shelf = shelf;
        this.notes = notes;
        status = InventorySessionStatus.IN_PROGRESS;
        createdAt = updatedAt = startedAt = now;
    }
    public void close(InventorySessionStatus terminal, Instant now) {
        if (status != InventorySessionStatus.IN_PROGRESS || terminal == InventorySessionStatus.IN_PROGRESS)
            throw InventorySessionException.transition();
        status = terminal;
        if (terminal == InventorySessionStatus.COMPLETED) completedAt = now;
        else cancelledAt = now;
        updatedAt = now;
    }
    public void updateNotes(String notes, Instant now) {
        if (status != InventorySessionStatus.IN_PROGRESS) throw InventorySessionException.closed();
        this.notes = notes;
        updatedAt = now;
    }
    public Long getId() { return id; }
    public Shelf getShelf() { return shelf; }
    public InventorySessionStatus getStatus() { return status; }
    public String getNotes() { return notes; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
}

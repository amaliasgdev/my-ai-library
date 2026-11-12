package com.mibiblioteca.bookservice.saga;

import com.mibiblioteca.bookservice.book.persistence.Book;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "saga_volume", schema = "public")
public class SagaVolume {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "saga_id", nullable = false, updatable = false)
    private Saga saga;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id")
    private Book book;

    @Column(nullable = false)
    private int position;

    @Column(name = "volume_label", length = 40)
    private String volumeLabel;

    @Column(name = "pending_title", length = 255)
    private String pendingTitle;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected SagaVolume() {
    }

    public SagaVolume(Saga saga, Book book, String pendingTitle, int position, String volumeLabel) {
        this.saga = saga;
        this.book = book;
        this.pendingTitle = pendingTitle;
        this.position = position;
        this.volumeLabel = volumeLabel;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Saga getSaga() {
        return saga;
    }

    public Book getBook() {
        return book;
    }

    public void setBook(Book book) {
        this.book = book;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public String getVolumeLabel() {
        return volumeLabel;
    }

    public void setVolumeLabel(String volumeLabel) {
        this.volumeLabel = volumeLabel;
    }

    public String getPendingTitle() {
        return pendingTitle;
    }

    public void setPendingTitle(String pendingTitle) {
        this.pendingTitle = pendingTitle;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }
}

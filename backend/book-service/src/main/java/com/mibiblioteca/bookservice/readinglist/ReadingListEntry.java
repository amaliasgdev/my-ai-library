package com.mibiblioteca.bookservice.readinglist;

import com.mibiblioteca.bookservice.book.persistence.Book;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "reading_list_entry", schema = "public")
public class ReadingListEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reading_list_id", nullable = false, updatable = false)
    private ReadingList readingList;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "book_id", nullable = false, updatable = false)
    private Book book;

    @Column(nullable = false)
    private int position;

    @Column(name = "added_at", nullable = false, updatable = false)
    private Instant addedAt;

    protected ReadingListEntry() {
    }

    public ReadingListEntry(ReadingList readingList, Book book, int position, Instant addedAt) {
        this.readingList = readingList;
        this.book = book;
        this.position = position;
        this.addedAt = addedAt;
    }

    public Long getId() {
        return id;
    }

    public ReadingList getReadingList() {
        return readingList;
    }

    public Book getBook() {
        return book;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public Instant getAddedAt() {
        return addedAt;
    }
}

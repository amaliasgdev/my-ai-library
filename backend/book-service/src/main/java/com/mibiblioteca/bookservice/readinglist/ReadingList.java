package com.mibiblioteca.bookservice.readinglist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "reading_list", schema = "public")
public class ReadingList {
    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id;

    @Column(nullable = false)
    private long revision;

    protected ReadingList() {
    }

    public Long getId() {
        return id;
    }

    public long getRevision() {
        return revision;
    }

    // The future transactional service must lock the singleton and check the
    // client's expected revision before changing it. This is not a Book version.
    public void setRevision(long revision) {
        this.revision = revision;
    }
}

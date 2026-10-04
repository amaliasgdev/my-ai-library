ALTER TABLE book ADD COLUMN reading_status VARCHAR(20) NOT NULL DEFAULT 'TO_READ';

ALTER TABLE book ADD CONSTRAINT chk_book_reading_status
    CHECK (reading_status IN ('TO_READ', 'READING', 'READ', 'ABANDONED'));

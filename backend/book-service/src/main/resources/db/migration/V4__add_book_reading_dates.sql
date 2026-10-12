ALTER TABLE book ADD COLUMN started_on DATE;
ALTER TABLE book ADD COLUMN finished_on DATE;

ALTER TABLE book ADD CONSTRAINT chk_book_reading_dates
    CHECK (started_on IS NULL OR finished_on IS NULL OR finished_on >= started_on);

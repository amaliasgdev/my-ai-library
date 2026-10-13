-- Expand only. Existing V7 labels are deliberately NOT reconciled or modified.
CREATE TABLE room (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT ck_room_name CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX uq_room_name ON room (lower(name));

CREATE TABLE bookcase (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_bookcase_room FOREIGN KEY (room_id) REFERENCES room(id),
    CONSTRAINT ck_bookcase_name CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX uq_bookcase_name ON bookcase (room_id, lower(name));

CREATE TABLE shelf (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bookcase_id BIGINT NOT NULL,
    name VARCHAR(50) NOT NULL,
    CONSTRAINT fk_shelf_bookcase FOREIGN KEY (bookcase_id) REFERENCES bookcase(id),
    CONSTRAINT ck_shelf_name CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX uq_shelf_name ON shelf (bookcase_id, lower(name));

ALTER TABLE book ADD COLUMN shelf_id BIGINT;
ALTER TABLE book ADD CONSTRAINT fk_book_shelf FOREIGN KEY (shelf_id) REFERENCES shelf(id);
ALTER TABLE book ADD CONSTRAINT ck_book_location CHECK (
    shelf_id IS NULL OR (room IS NULL AND bookcase IS NULL AND shelf IS NULL)
);
CREATE INDEX ix_book_shelf ON book(shelf_id);

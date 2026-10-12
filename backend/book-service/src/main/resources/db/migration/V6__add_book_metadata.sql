ALTER TABLE book
    ADD COLUMN publisher VARCHAR(255),
    ADD COLUMN publication_year INTEGER,
    ADD COLUMN page_count INTEGER,
    ADD COLUMN language VARCHAR(2),
    ADD COLUMN genres VARCHAR(50)[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT ck_book_publication_year CHECK (publication_year IS NULL OR publication_year BETWEEN 1 AND 2100),
    ADD CONSTRAINT ck_book_page_count CHECK (page_count IS NULL OR page_count > 0),
    ADD CONSTRAINT ck_book_language CHECK (language IS NULL OR language ~ '^[a-z]{2}$'),
    ADD CONSTRAINT ck_book_genres_count CHECK (cardinality(genres) <= 10),
    ADD CONSTRAINT ck_book_genres_no_nulls CHECK (array_position(genres, NULL) IS NULL);

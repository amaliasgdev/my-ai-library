CREATE TABLE public.reading_list (
    id BIGINT PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_reading_list_singleton CHECK (id = 1),
    CONSTRAINT ck_reading_list_revision CHECK (revision >= 0)
);

INSERT INTO public.reading_list (id, revision) VALUES (1, 0);

CREATE TABLE public.reading_list_entry (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reading_list_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    position INTEGER NOT NULL,
    added_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_reading_list_entry_list FOREIGN KEY (reading_list_id)
        REFERENCES public.reading_list(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reading_list_entry_book FOREIGN KEY (book_id)
        REFERENCES public.book(id) ON DELETE CASCADE,
    CONSTRAINT uq_reading_list_entry_book UNIQUE (reading_list_id, book_id),
    CONSTRAINT uq_reading_list_entry_position UNIQUE (reading_list_id, position)
        DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT ck_reading_list_entry_position CHECK (position > 0)
);

CREATE INDEX ix_reading_list_entry_book ON public.reading_list_entry(book_id);

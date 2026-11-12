CREATE TABLE public.saga_volume (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    saga_id BIGINT NOT NULL,
    book_id BIGINT,
    position INTEGER NOT NULL,
    volume_label VARCHAR(40),
    pending_title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_saga_volume_saga FOREIGN KEY (saga_id)
        REFERENCES public.saga(id) ON DELETE CASCADE,
    CONSTRAINT fk_saga_volume_book FOREIGN KEY (book_id)
        REFERENCES public.book(id) ON DELETE RESTRICT,

    CONSTRAINT uq_saga_volume_book UNIQUE (saga_id, book_id),
    CONSTRAINT uq_saga_volume_position UNIQUE (saga_id, position)
        DEFERRABLE INITIALLY IMMEDIATE,

    CONSTRAINT ck_saga_volume_position CHECK (position > 0),
    CONSTRAINT ck_saga_volume_target CHECK (
        (book_id IS NOT NULL AND pending_title IS NULL)
        OR (book_id IS NULL AND btrim(coalesce(pending_title, '')) <> '')
    )
);

CREATE INDEX ix_saga_volume_book ON public.saga_volume(book_id);
CREATE INDEX ix_saga_volume_saga_ordered ON public.saga_volume(saga_id, position);

CREATE TABLE public.saga (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    description TEXT,
    image_url VARCHAR(2048),
    revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_saga_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT ck_saga_revision CHECK (revision >= 0)
);

-- Case-insensitive uniqueness ignoring outer spaces; a missing author compares as an empty string.
CREATE UNIQUE INDEX uq_saga_name_author
    ON public.saga (lower(btrim(name)), lower(coalesce(btrim(author), '')));

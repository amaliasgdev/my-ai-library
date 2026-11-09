-- Flyway executes this PostgreSQL DDL in a single transaction (default).
-- Do not add CASCADE or IF EXISTS: unexpected dependencies/schema drift must fail.
ALTER TABLE public.book DROP CONSTRAINT fk_book_shelf;
ALTER TABLE public.book DROP CONSTRAINT ck_book_location;
DROP INDEX public.ix_book_shelf;

ALTER TABLE public.book
    DROP COLUMN room,
    DROP COLUMN bookcase,
    DROP COLUMN shelf,
    DROP COLUMN shelf_id;

-- Child-first order. Owned identity sequences/indexes disappear with their table.
DROP TABLE public.inventory_session;
DROP TABLE public.shelf;
DROP TABLE public.bookcase;
DROP TABLE public.room;

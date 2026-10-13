# My AI Library

## Frontend technical base

Location: [`frontend/mi-biblioteca-web`](frontend/mi-biblioteca-web/README.md).
Requires Node **22.22.3+ within Node 22** and npm **10+**.

The catalog's **Introducir ISBN** action opens a Material dialog for manual
ISBN-13 entry. ASCII spaces and hyphens are allowed and removed before strict
checksum validation; ISBN-10 and other characters are rejected. Continue/Enter
starts creation via `/books/new?isbn=...`, reusing BookCreate's existing one-time
lookup and URL cleanup. Cancel stays in the catalog. Nothing is persisted until
the user reviews the form and presses **Guardar**.

```powershell
cd frontend/mi-biblioteca-web
npm install
npm start
```

Open `http://localhost:4200/`: `/` redirects to `/books`, a lazy-loaded,
paginated book catalog. Angular Material is the **only UI library**, with SCSS/CSS Grid and
Flexbox for responsive layout. PrimeNG, Tailwind and Bootstrap are not installed.
Use **Añadir libro** to open `/books/new`, create a book and return to the catalog.
The catalog's **Escanear ISBN** add-book action reuses the existing local ZXing
dialog (camera or image). Cancel stays in the catalog; a valid barcode navigates
to `/books/new?isbn=...`. BookCreate consumes a single valid ISBN seed once,
runs the existing metadata lookup and replaces the URL with `/books/new` without
repeating or canceling the lookup. Reloading the clean URL does not lookup again;
opening a fresh seeded URL does. Nothing is saved until the user presses **Guardar**.
Each card has **Editar**, opening `/books/{id}/edit` with the current book values.
Saving replaces all bibliographic fields and returns to the catalog; Cancelar returns without saving.
The catalog supports detail, deletion, submitted search, sorting and filters.
There is no fake runtime book data, SSR or PWA.

```powershell
npm run lint
npm run format:check
npm run build
npm run test:ci
```

Use `npm run format` to apply frontend formatting and `npm ci` for subsequent
reproducible installations. Vitest tests do not require a running backend.

BooksService uses the centralized `/api` base URL. During development,
Angular proxies `/api/**` to Spring Boot at `http://localhost:8081`, without backend
CORS changes. Run the backend separately to use the catalog and creation/edit forms manually; unit tests
mock HTTP and do not require the backend.
The proxy is not part of the production bundle; production routing is a future
deployment responsibility. A Material light theme is active; dark theme styles
are prepared under `html.app-dark`, without a theme selector.

## Multiple ISBN import

**Importar ISBN** in the catalog opens `/books/import`, preserving canonical
catalog navigation context. Paste ISBN-13 entries separated by lines/CRLF,
commas or semicolons. Spaces separate complete ISBN only when unambiguous;
internal ASCII spaces/hyphens use the existing strict manual ISBN validation.
Ambiguous input is shown for correction, never guessed or extracted from free text.
ISBN-10, Unicode digits, tabs, invalid checksums/prefixes and 9790 are rejected.

Limits are **25 valid unique ISBN**, **100 detected entries** and **10,000
characters**. Exceeding a limit blocks all requests, without silent truncation.
Canonical duplicates are counted and processed once. Exact local ISBN search
precedes metadata lookup through backend/Open Library; at most **2** row pipelines
run concurrently. Existing books skip lookup, and checking failures do not imply
the ISBN is new. Cancellation stops queued work but cannot guarantee stopping
external requests already running on the backend.

Every new book requires **Confirmar datos** in a dialog reusing BookForm, with
fixed ISBN and no HTTP. Partial or missing metadata can be completed manually.
Only confirmed rows can be selected. **Importar seleccionados** then creates
books using individual POSTs, **one at a time**, without a global transaction:
previous successes remain when other rows fail. Detener waits for the active
request and starts no further rows. The summary retains per-book results.

409 means conflict, never overwrite; 400 requires correction. Network/timeouts/
5xx are **uncertain**, with no automatic POST retry: first check the ISBN again;
if it exists, do not POST; if absent, allow explicit retry with a warning that
the previous request could still finish. Acknowledged successful POSTs are not
repeated. Only a real violation of `uq_book_isbn` maps to 409; other integrity
failures keep their existing treatment.

The batch exists only in page memory. **Reloading or leaving loses pending work**,
and cancellation does not roll back already-created books or server commits.
Metadata consultation uses backend/Open Library, so this flow is not offline.

## Catalog filters

### Optional physical location

Books have optional text fields **room** (100 characters), **bookcase** (100)
and **shelf** (50). Partial locations are allowed; shelf is a label such as `3`,
`Superior` or `Abajo`, never an integer. V7 adds only three nullable columns to
`book`, with no defaults, indexes, FK or new tables. Existing books remain unlocated.

POST omission/null/blank stores null; PUT replaces all three fields, so omission,
null or blank clears an old location. Responses include all three nullable fields.
Raw input over the maximum is rejected before trimming, not truncated. Unicode
control characters and line/paragraph separators are rejected; exterior spaces
are trimmed, preserving case, accents, punctuation and internal spacing.

BookForm's **Ubicación** section is available in creation, editing and bulk import
review. Import location starts empty and is entered manually for each row; ISBN
lookup/Open Library never fills or clears it. Detail displays explicit labels only
for present components; cards show compact wrapping text only when location exists.

The filter panel includes **Habitación**, **Estantería** and **Balda**, applied
explicitly. Both list and search support:

```text
GET /api/books?room=Salón&bookcase=Billy%20izquierda&shelf=3
GET /api/books/search?title=Dune&room=Salón
```

Location filters use AND and exact case-insensitive, accent-sensitive equality:
`Salón` matches `salón`, not `Salon`; `%`/`_` are literal and null does not match.
Each scalar may occur once, must be nonblank, within its raw limit and without
controls. Invalid HTTP parameters return 400; invalid URL values are discarded
individually before the GET, retaining valid filters and canonical navigation
context through detail/edit/import, reload and Back/Forward. Sorting is unchanged.

**The tuple (room, bookcase, shelf) is a textual criterion, not a stable shelf
identity.** Shelf photos, persistent inventory and mass reassignment will require
a separately approved evolution toward **Room -> Bookcase -> Shelf**, with stable
Shelf ID and nullable Book FK. That model is not implemented now. Authoritative
autocomplete is also deferred: no page-local guesses, full-catalog loading or new
distinct-value endpoints.

Both existing endpoints accept the same optional filters, preserving pagination,
sorting and the `BookPageResponse` contract:

```text
GET /api/books?readingStatus=READ&readingStatus=READING&ratingMin=4&yearFrom=2020&genre=Terror
GET /api/books/search?author=King&ratingMin=4&language=es&publisher=Press
```

Filters combine with AND; repeated reading states combine with OR. `/search`
still requires title, author or ISBN; ISBN remains exclusive with title/author,
but can combine with filters. List and search share JPA Specifications.

| Parameter | Contract |
| --- | --- |
| `readingStatus` | Exact enum, at most 4 occurrences, deduplicated; no CSV |
| `ratingMin` | Integer 1–5, inclusive; unrated books do not match |
| `yearFrom`, `yearTo` | Inclusive publication-year bounds, 1–2100, from <= to; unknown years do not match |
| `genre` | Trimmed nonblank <=50, exact case-insensitive array element |
| `language` | Recognized two-letter ISO 639-1 code, case-insensitive |
| `publisher` | Trimmed nonblank <=255, literal case-insensitive substring |
| `room`, `bookcase` | Single nonblank text <=100 raw characters, trimmed, no controls, exact case-insensitive/accent-sensitive |
| `shelf` | Single nonblank text <=50 raw characters; same exact matching, never numeric |

Repeated scalar parameters, blank supplied filters and invalid values return
400 ProblemDetail with public field names in `errors`. `%` and `_` are literals,
not user-controlled SQL wildcards. Genre uses a Hibernate FunctionContributor
rendering bound `EXISTS/unnest` on PostgreSQL `varchar[]`, tested for paging and
count on PostgreSQL 16. Genre filtering adds no schema changes; physical location
uses V7. No filter indexes or dependencies were added.

The Material filter panel applies explicitly: editing does not request data.
**Aplicar filtros** and **Limpiar filtros** reset page 0 while preserving search,
size and sorting; searching/clearing search preserves filters. Applied state
lives in the canonical URL, surviving reload, Back/Forward and detail/edit return.
Invalid URL filters are discarded silently before the single GET, unlike invalid
form submissions. Confirmed inline writes reload when active filters depend on
the changed status/rating; they are never repeated or filtered locally.

## Managed book covers

| Endpoint | Result |
| --- | --- |
| `POST /api/books/{id}/cover` | Multipart part **file**; 200 with complete `BookResponse` |
| `DELETE /api/books/{id}/cover` | 204; idempotent for an existing book |
| `GET /api/covers/{filename}` | Public image bytes; invalid/missing identifier returns 404 |

Only **JPEG and static PNG** are supported. The application checks declared MIME,
actual signature, matching ImageIO reader, dimensions and full decoding. PNG chunk
checks include CRC and rejection of APNG animation. WebP, GIF, SVG and APNG return
415. The original filename is ignored; extension follows the actual format.

Limits: **5 MiB / 5,242,880 bytes** per file, **6 MiB** per multipart request,
width/height 1–6000, at most **20,000,000 pixels**. Images are stored unchanged:
no resizing, compression, conversion, metadata stripping or thumbnails.

### Configuration and storage

In `backend/book-service/src/main/resources/application.yml`:

```yaml
storage:
  covers:
    directory: ${COVERS_DIRECTORY:./data/covers}
    public-base-url: ${COVERS_PUBLIC_BASE_URL:http://localhost:8081/api/covers}
    max-file-size: 5MB
    max-width: 6000
    max-height: 6000
    max-pixels: 20000000
```

The relative directory is resolved from the process working directory. Managed
data is ignored by Git and is not packaged with the application. The directory is
created lazily for uploads; physical paths never appear in `coverUrl`.

`CoverStorage` isolates filesystem operations behind safe keys and bytes.
`FileSystemCoverStorage` generates `{bookId}-{uuid}.jpg/.png`, uses exclusive
temporary writes and same-directory publication without overwriting existing files.
Only managed filename patterns are readable; temporaries, traversal and symbolic
links are rejected. The storage folder and its ancestors must not be symlinks and
must not be writable by untrusted users.

For future NAS deployment, configure `COVERS_DIRECTORY` to an accessible mounted
folder (a persistent volume if containerized) and `COVERS_PUBLIC_BASE_URL` to the
backend's public HTTPS image endpoint. **NAS deployment is not implemented or
tested.** No S3/CDN is included. Back up the folder and PostgreSQL together.

Public URLs never use `file://`, filesystem paths or the incoming request's Host.
Preserve the public origin/path when moving storage: existing absolute URLs are not
automatically rewritten when configuration changes.

### Transactions and external references

Upload checks book existence, validates and fully stores the new file, then starts
a short database transaction to reload the book and replace `coverUrl`. Only after
commit is the old managed file deleted. DELETE cover commits a cleared reference
before deleting its managed file. A missing physical file is already deleted.

Confirmed database rollback removes the new file when possible. An uncertain
commit outcome retains it. Cleanup failures are logged without exposing paths;
post-commit failures preserve the successful 200/204 response and the new reference.
Crashes and cleanup failures can leave orphan files; there is no automatic sweeper
or distributed filesystem/database transaction.

PUT book replacing/clearing a managed URL and DELETE book use the same post-commit
cleanup. Managed URLs cannot be assigned manually through book creation or PUT;
PUT can preserve only the book's current managed URL. External HTTP/HTTPS URLs
remain supported. Replacing or clearing Open Library/other external references
never fetches or deletes the remote resource. ISBN lookup is unchanged.

Concurrency remains **last writer**, without pessimistic locks or `@Version`.
Failure handling is coordinated for sequential operations, not serializable for
concurrent CRUD/upload/cleanup. Overlapping edits can leave stale references or
orphan files; avoid simultaneous modifications of the same book in v1.

GET returns canonical `Content-Type`, `Content-Length`, inline disposition,
`X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=86400`.
Covers are public; UUIDs are not authorization. Cached bytes can survive deletion
for a day. Replacements receive a different URL.

Errors use safe `ProblemDetail`: 400 missing/empty/malformed/corrupt image or invalid
dimensions, 404 missing book/cover, 413 excessive size, 415 unsupported/mismatched
MIME, 500 storage/persistence failure. Field errors use `errors.file` or
`errors.coverUrl`. Tomcat drains at most 8 MiB to deliver normal oversize 413 responses;
extremely large rejected bodies may instead cause a connection closure.

Tests use temporary directories, localhost HTTP for servlet limits, and PostgreSQL
commits for transaction/cleanup verification; no real NAS or Internet is required.

## ISBN metadata lookup

`GET /api/books/isbn-lookup?isbn=978-0132350884`

Queries Open Library for a metadata proposal. **It never reads or writes the local
book repository**, checks duplicates or creates a book. Review and complete the
proposal before submitting it through the existing CRUD API.

The response contains `isbn`, `title`, `author`, `publisher`, `publicationYear`,
`pageCount`, `language`, `genres` and `coverUrl`. Unknown fields are `null`;
unknown genres are `[]`. Titles and authors can be unknown.

- ISBN-10/13 accepts spaces and hyphens, normalizes `X`, and validates checksum;
  ISBN-13 requires prefix 978 or 979. Existing CRUD/search validation is unchanged.
- Uses `/isbn/{isbn}.json`, at most one controlled same-host edition redirect,
  and optional `/search.json?q=isbn:{isbn}` enrichment matching the edition's work.
  Maximum **3 HTTP requests**, no retries, fallback or cache.
- Authors are deduplicated and joined with `; ` without truncating names (255 max).
  Languages map to ISO 639-1 when unambiguous. Edition years must be recognizable
  and within 1–2100; work publication years are not substituted.
- Invalid optional external values are discarded. Genres preserve order and first
  spelling, are distinct ignoring case, and limited to 10 values of 50 characters.
- Covers are URL references only: no image requests or downloads.

| HTTP | Meaning |
| --- | --- |
| 200 | Full or partial proposal |
| 400 | Missing/invalid ISBN; no external request |
| 404 | ISBN has no external edition |
| 502 | Malformed/incompatible provider response or unsafe redirect |
| 503 | Connection failure, upstream 429 or 5xx |
| 504 | Timeout or exhausted lookup budget |

Errors use `ProblemDetail`, without upstream bodies or internal configuration.
A valid `Retry-After` from upstream 429 may accompany our 503 response.

Configuration is centralized under `external.books.open-library` in
`backend/book-service/src/main/resources/application.yml`: API/cover base URLs,
connect timeout **1s**, request timeout **3s**, total lookup budget **8s** and
`user-agent: MyAILibrary`. Requests share the remaining total budget. Optional
contact information can be supplied using `OPEN_LIBRARY_CONTACT`; none is invented.
There are no provider calls at startup. Intended for low-volume personal use;
there is no rate limiter or bulk lookup.

Swagger UI: `/swagger-ui.html`; OpenAPI JSON: `/v3/api-docs`.

Run tests from `backend/book-service` using `.\mvnw.cmd clean test`.
Lookup tests mock Open Library and never access the Internet. Existing persistence
tests require the configured development PostgreSQL database.

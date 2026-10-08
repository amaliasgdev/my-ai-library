# My AI Library

## Frontend technical base

Location: [`frontend/mi-biblioteca-web`](frontend/mi-biblioteca-web/README.md).
Requires Node **22.22.3+ within Node 22** and npm **10+**.

```powershell
cd frontend/mi-biblioteca-web
npm install
npm start
```

Open `http://localhost:4200/`: `/` redirects to `/books`, a lazy-loaded, read-only
paginated book catalog. Angular Material is the **only UI library**, with SCSS/CSS Grid and
Flexbox for responsive layout. PrimeNG, Tailwind and Bootstrap are not installed.
Use **Añadir libro** to open `/books/new`, create a book and return to the catalog.
Each card has **Editar**, opening `/books/{id}/edit` with the current book values.
Saving replaces all bibliographic fields and returns to the catalog; Cancelar returns without saving.
There is no frontend deletion, search, fake book data, SSR or PWA yet.

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

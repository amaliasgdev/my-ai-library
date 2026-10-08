# My AI Library

## Frontend technical base

Location: [`frontend/mi-biblioteca-web`](frontend/mi-biblioteca-web/README.md).
Requires Node **22.22.3+ within Node 22** and npm **10+**.

```powershell
cd frontend/mi-biblioteca-web
npm install
npm start
```

Open `http://localhost:4200/`: `/` redirects to `/books`, a standalone technical
placeholder. Angular Material is the **only UI library**, with SCSS/CSS Grid and
Flexbox for responsive layout. PrimeNG, Tailwind and Bootstrap are not installed.
There is no catalog, CRUD, search, fake book data, SSR or PWA yet.

```powershell
npm run lint
npm run format:check
npm run build
npm run test:ci
```

Use `npm run format` to apply frontend formatting and `npm ci` for subsequent
reproducible installations. Vitest tests do not require a running backend.

Future HTTP services use the centralized `/api` base URL. During development,
Angular proxies `/api/**` to Spring Boot at `http://localhost:8081`, without backend
CORS changes. Run the backend separately when exercising real API requests.
The proxy is not part of the production bundle; production routing is a future
deployment responsibility. A Material light theme is active; dark theme styles
are prepared under `html.app-dark`, without a theme selector.

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

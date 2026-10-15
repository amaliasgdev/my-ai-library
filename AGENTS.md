# AGENTS.md

## Project overview

Project name: My AI Library

Repository root:
C:\mis-proyectos\mi-biblioteca

This project is a personal library management application that will later include AI-assisted functionality.

The project is being built incrementally. Do not introduce functionality that has not been explicitly requested.

---

## Current architecture

Backend:
- Java 21
- Spring Boot 3.5.16
- Maven Wrapper
- Spring Web
- Spring Data JPA
- Jakarta Validation
- Spring Boot Actuator
- Flyway
- PostgreSQL 16

Frontend:
- Angular 22 (standalone, zoneless, routing, strict TypeScript and templates)
- Angular CLI 22
- Angular Material 22 is the only UI component library
- Angular CDK 22 is included only as a natural part of the Material stack
- PrimeNG and @primeuix/themes are not used
- Tailwind and Bootstrap are not used
- Native SCSS/CSS, CSS Grid and Flexbox for layout, responsive styles and customization
- Vitest with jsdom, angular-eslint/ESLint and Prettier

Containerization:
- Docker Compose

Current backend service:
- book-service

book-service location:
- backend/book-service

book-service port:
- 8081

Database:
- PostgreSQL 16
- Database name: bookdb
- Development user: booksvc

---

## Project structure

Current expected structure:

```text
mi-biblioteca/
├── AGENTS.md
├── README.md
├── .gitignore
├── docker-compose.yml
├── frontend/
│   └── mi-biblioteca-web/
└── backend/
    └── book-service/
        ├── .mvn/
        ├── mvnw
        ├── mvnw.cmd
        ├── pom.xml
        └── src/
            ├── main/
            │   ├── java/
            │   │   └── com/mibiblioteca/bookservice/
            │   └── resources/
            │       ├── application.yml
            │       └── db/migration/
            └── test/
```

Do not reorganize the project structure unless explicitly requested.

Frontend workspace:

```text
frontend/mi-biblioteca-web/
├── angular.json
├── package.json
├── package-lock.json
├── proxy.conf.json
└── src/
    ├── app/
    │   ├── app.config.ts
    │   ├── app.routes.ts
    │   ├── core/config/api.config.ts
    │   ├── layout/app-shell/
    │   └── features/books/
    │       ├── models/book.models.ts
    │       ├── services/books.service.ts
    │       ├── components/
    │       │   ├── book-card/
    │       │   ├── book-delete-dialog/
    │       │   ├── book-reading-dates-dialog/
    │       │   └── book-form/
    │       └── pages/
    │           ├── books-catalog/
    │           ├── book-create/
    │           ├── book-detail/
    │           └── book-edit/
    └── styles/
        ├── _material-theme.scss
        └── _tokens.scss
```

## Frontend rules

- Workspace: frontend/mi-biblioteca-web; keep its npm setup independent from Maven
- Node 22.22.3 or later in the Node 22 line; npm 10 or later
- Angular framework/compiler 22.2.1, CLI/build 22.2.2, Material/CDK 22.2.2
- TypeScript 6.0.2 and RxJS 7.8.2; maintain Angular's compatibility constraints
- Vitest 5.0.3/jsdom 30.1.2, angular-eslint 22.5.0, ESLint 10.12.0, Prettier 3.9.9
- Commit package-lock.json when commits are explicitly requested; never use --force or --legacy-peer-deps to hide incompatibility
- Angular Material is the ONLY UI library for buttons, controls, forms, dialogs, tables, pagination, snackbars, tooltips, icons, cards, tabs and navigation
- No PrimeNG, @primeuix/themes, Tailwind, Bootstrap or other UI/utility framework without explicit approval
- CDK is part of Material and its component harnesses, not a separate competing UI system
- Standalone components, provideRouter, strict TypeScript and strictTemplates; no application NgModules
- Native SCSS/CSS Grid/Flexbox handles layout, spacing, responsive rules and visual customization
- Keep component styles local; global styles and semantic Material theme tokens stay in src/styles.scss and src/styles/
- Use public Material theming APIs (mat.theme), not internal CSS selectors, ::ng-deep or unnecessary !important
- Initial light theme; html.app-dark has dark color tokens prepared, but there is no switch, preference persistence or automatic OS theme selection
- System fonts only initially; no remote font/CDN dependency
- Root route redirects to /books; /books lazy-loads the standalone BooksCatalog page
- BooksCatalog is a server-paginated catalog with local signals, loading/success/error states and switchMap cancellation for GET; no stale cards during loading
- BooksService uses HttpClient and API_CONFIG for getBooks(), searchBooks(BookSearchRequest, BooksPageRequest?), createBook(), getBook(id), updateBook(id, BookRequest), deleteBook(id), updateReadingStatus(id, status), updateRating(id, rating), deleteRating(id), startReading(id, ReadingDateRequest), finishReading(id, ReadingDateRequest), updateReadingDates(id, UpdateReadingDatesRequest) and deleteReadingDates(id); list/search UI defaults to title ASC with server-side sorting
- BookCatalogSort/currentSort exposes only title, author, createdAt, readingStatus and rating with ASC/DESC; separate Material selects apply changes immediately, reset page to 0 and retain pageSize/currentSearch; selecting the same value does not reload
- BookCatalogQuery in models/book-catalog-query.ts represents URL-applied page/size/sortBy/direction/search using existing types; URL is the sole source of navigable catalog state, with no default HTTP trigger before reading queryParamMap
- Catalog URL supports page/size/sortBy/direction/title/author/isbn and readingStatus/ratingMin/yearFrom/yearTo/genre/language/publisher/room/bookcase/shelf/roomId/bookcaseId/shelfId; page is digit-only 0..2147483647, size is 10/20/50/100, sortBy is title/author/createdAt/readingStatus/rating and direction is exactly ASC/DESC. Only readingStatus may repeat; unknown parameters are removed
- Defaults page=0/size=20/sortBy=title/direction=ASC/search=null are omitted from deterministic serialization; pure parse/serialize/canonical comparison helpers compare keys/values independent of order, and noncanonical URLs replace history before any GET
- URL search trims text, discards blank/overlong values without truncation, uses the existing CRUD ISBN syntax without checksum, gives valid ISBN priority over title/author and retains valid title/author if ISBN is invalid; invalid URLs produce no validation alerts
- User search/sort/page/size actions only navigate normally when the applied state changes; accepted canonical URL updates signals and drives one switchMap GET chain with internal retry/write-reload events, removing stale cards and canceling previous GET
- Search inputs synchronize initially or when URL-applied search changes, never on page/sort/retry/write reload; drafts stay independent from currentSearch and do not navigate or request until explicit valid submit
- New searches and Limpiar búsqueda preserve currentSort; page-size changes preserve sorting/search and reset page to 0; no frontend sorting, custom status order or null-rating rearrangement
- Backend list/search share BookSpecifications and JpaSpecificationExecutor; BookFilterRequest validates raw query cardinality before repository access. Filters combine with AND, states with IN. Genre uses bound Hibernate book_genre_matches via EXISTS/unnest over varchar[], proven on PostgreSQL 16 for paging/count without duplicate rows; no migration/index/dependency changes
- Filter params: readingStatus exact enum, at most 4 occurrences, deduplicated, no CSV; ratingMin integer 1..5; yearFrom/yearTo integers 1..2100 with from <= to; genre trimmed nonblank <=50; language trimmed recognized ISO 639-1 lowercase; publisher trimmed nonblank <=255, literal case-insensitive substring (%/underscore escaped). Scalars may occur once, present empty values return 400 ProblemDetail errors with public names; null ratings/years do not satisfy active bounds
- BooksCatalog has a separate typed Reactive Material filter form and currentFilters URL snapshot. Apply/Clear reset page 0 preserving search/sort/size; search/Clear search retain filters. Draft edits never request/navigate, and drafts survive page/sort/retry/write reload. DELETE blocks Apply/Clear with UI/code guards
- URL filters omit defaults/empty values, trim text, lowercase language and deduplicate states in fixed enum order. Invalid/repeated scalar filters are discarded independently, invalid/overlong state groups are discarded entirely, inverted year ranges discard both bounds; canonical replaceUrl occurs before GET, without validation alerts. Detail/edit context uses the same helpers and preserves filters
- BooksService getBooks(options, filters?) and searchBooks(criteria, options, filters?) share filter HTTP serialization, repeating state parameters and omitting empty/undefined values. State/start/finish confirmations reload current query when a state filter is active; rating confirmations reload when ratingMin is active, in addition to existing sort-dependent reloads; never locally filter/reorder or repeat successful writes
- BooksCatalog has an inline typed Reactive search form for title/author/isbn; only Buscar or native form submit starts a search, never keystrokes
- currentSearch is the URL-applied search snapshot (null means normal list), independent from edited inputs; one GET chain selects getBooks() or searchBooks(), preserving criteria for pagination, retry and DELETE reload
- Search requires at least one nonblank criterion; title/author can combine, ISBN is exclusive; limits are 255/255/20 and ISBN uses the shared CRUD syntax pattern without checksum or ISBN lookup
- New searches and page-size changes navigate to page 0 and retain current criteria/size/sort as applicable; Limpiar always resets draft inputs and navigates to normal list page 0 preserving size/sort, without GET if effective state is unchanged; no localStorage/sessionStorage persistence
- Search failures preserve form and snapshot with safe inline messages and explicit retry of the actual failed request; no results means No se encontraron libros, not an empty library
- Frontend BookResponse/BookPageResponse models mirror the backend; nullable fields remain nullable and ISO dates remain strings
- BookRequest is a separate frontend request model: bibliographic fields plus either explicit location {kind:SHELF,shelfId}, explicit LEGACY, or compatible top-level V7 room/bookcase/shelf. Never send location alongside top-level labels, including null labels. Empty optional values become null and absent genres become []
- Physical location is optional and partial: room/bookcase/shelf are nullable text (100/100/50 raw characters), never numeric shelf IDs. BookForm exposes Habitación/Estantería/Balda in create/edit/import review; null preloads as empty, builder trims exterior Unicode space separators and maps blanks to null while preserving case, accents, punctuation and inner spaces. Validate raw length before trim and reject Unicode Cc/Zl/Zp characters; no silent truncation/repair
- BookDetail shows an explicitly labelled Ubicación section only when any component exists, omitting absent fields; BookCard shows compact optional Ubicación text with mobile wrapping, no tooltip or placeholder. Lookup never proposes, fills or clears physical location. Bulk drafts start empty and each confirmed request/draft preserves manually entered location independently, never from catalog filters or another row
- room/bookcase/shelf filters work in list/search through BookSpecifications: AND, exact lower(column)=lower(bound value), case-insensitive but accent-sensitive, literal %/_, null does not match active filters, no sorting changes. Raw filter scalars occur once, must be nonblank, within 100/100/50 and without Cc/Zl/Zp controls; invalid HTTP yields 400 errors under the public field name. Frontend drafts request only on Apply/Clear; URL discards each invalid/repeated/overlong raw value independently, trims valid ones, preserves case and canonicalizes before GET. Shared helpers preserve them through detail/edit/import context and Back/Forward
- /books/new and /books/:id/edit lazy-load standalone BookCreate and BookEdit; static routes precede dynamic routes
- /books/:id lazy-loads standalone BookDetail; route order is books/import, books/new, books/:id/edit, books/:id, books. BookCard has separate accessible Ver detalle, Editar and Eliminar actions; the whole card is not a link
- BookDetail uses existing getBook(id), local loading/loaded/error state and one switchMap GET chain for route IDs and explicit retry; changing ID immediately removes old content and cancels GET, and takeUntilDestroyed cancels subscriptions
- book-id.ts shares digit-only positive safe-integer parsing between BookEdit and BookDetail; invalid IDs produce a local error without HTTP or retry. Valid-ID GET errors use safe 404/0/general messages and retry only the current GET
- BookDetail shows confirmed cover/fallback, title/author, all bibliographic metadata, ISO language code unchanged, ordered read-only Material genre chips, status/rating, reading dates, description with preserved newlines and discreet createdAt/updatedAt; responsive local CSS Grid uses cover/content columns on desktop and one column on mobile
- book-display.ts shares reading-status labels and text-only YYYY-MM-DD -> DD/MM/YYYY (Sin fecha for null) with BookCard; DatePipe separately formats timestamps as local dd/MM/yyyy HH:mm without changing source strings
- BookDetail links Editar to /books/:id/edit and Volver al catálogo to /books; deletion reuses BookDeleteDialog and deleteBook(id), only explicit confirmation writes, success navigates to /books without GET, and failures remain inline (404 is not success)
- BookCard receives serialized applied catalog params as an input for detail/edit links; BookDetail forwards only normalized supported context to edit/back/delete-success navigation, and BookEdit preserves context on Cancelar/PUT success; query params never affect book GET/PUT/forms, BookCreate is unchanged, and direct entry without valid context returns to /books
- Browser Back/Forward restores catalog directly from URL, without history.back(), NavigationState, storage, global store or scroll-restoration machinery
- book-delete.helpers.ts shares only dialog configuration and safe DELETE error mapping with BooksCatalog; BookDetail guards duplicate dialogs/writes, blocks its navigation while DELETE is pending, closes dialogs/cancels client requests on route change or destruction and rejects stale results; cancellation does not roll back a server commit
- BookDetail has no inline editing, reading-state/date writes, cover management or ISBN lookup
- BookForm shares typed Reactive Forms, Material fields, validators, genres, pending input, the sole BookRequest builder and server field error handling; it has no HTTP or routing responsibilities
- BookForm additionally supports initialDraft (BookFormValue, never a fake BookResponse), saveLabel (default Guardar) and isbnReadonly (default false) for BookImportReviewDialog; normal create/edit defaults and validation remain unchanged. Review disables scanner/lookup by their existing false defaults, validates and emits BookRequest only; Confirmar datos never writes
- BookCreate/BookEdit own HTTP, submission state, safe general messages and navigation; no inheritance or generic form framework
- Individual ISBN lookup is available at /books/new: optional BookForm UI is disabled by default and enabled by BookCreate; /books/import separately orchestrates explicit bulk lookup using the same endpoint. BookEdit exposes no lookup controls/states
- Catalog Importar ISBN opens lazy /books/import, transporting only canonical catalog context through existing helpers; returning preserves search/filters/page/size/sort. Batch text/results/progress remain page-local memory, never query params/storage; reload/navigation loses pending work and client cancellation never rolls back server commits
- Bulk ISBN parser first separates CR/LF/comma/semicolon, accepts a single 13-digit candidate with ASCII spaces/hyphens, or splits space-separated complete 13-digit tokens only when unambiguous; ambiguous/free-text/Unicode/tab input is displayed without guessing/repair. Each candidate uses unchanged normalizeManualIsbnImport (ISBN-13/checksum/978/979/no9790); deduplicate valid canonical ISBN preserving first position and occurrence count. Limits: 25 valid unique ISBN, 100 detected entries before deduplication, 10000 characters; exceeding any bound blocks all HTTP without silently truncating
- Bulk rows separate existence pending/new/existing/error, metadata pending/found/notFound/error and creation notReady/ready/creating/created/error/uncertain. Exact searchBooks({isbn}, {page:0,size:1}) without catalog filters precedes lookup, at most 2 row pipelines concurrently; existing ISBN skips lookup, existence error is never new. Cancellation stops GETs/queue and generation guards reject late results; retries are explicit and per failed row
- Bulk metadata never makes a row ready automatically. Each valid/new row must be confirmed in BookImportReviewDialog with fixed ISBN and valid BookRequest; partial/notFound/error metadata may be completed manually, existence errors/existing/invalid/unconfirmed/created rows cannot be selected. Confirming review has no book HTTP/routing/persistence; separate explicit location dialogs may immediately persist locations
- Importar seleccionados freezes selection and POSTs existing createBook() one at a time, without global transaction. 201 records ID/created and is never repeated; 409 is conflict/existing with no overwrite, 400 needs review/reconfirmation, network/timeouts/5xx become uncertain with no automatic POST retry. Reconcile uncertain via exact ISBN search: existing blocks POST, absent permits explicit selection/retry with warning that an earlier request may still complete. Detener stops new writes but waits for the active request; progress and per-row summary remain visible
- Local ISBN barcode scanning is available in BookCreate and through the catalog's Escanear ISBN add-book action; both reuse IsbnScanDialog, with no scanner in BookEdit. BookForm's scanEnabled defaults false and scanRequested is UI-only; BookCreate owns the existing lookup
- Catalog scan success revalidates the unchanged barcode ISBN helper and navigates only to /books/new?isbn=...; cancel stays in the catalog, destruction closes the dialog and late results never navigate
- Catalog Introducir ISBN opens BookIsbnImportDialog with a typed Reactive form and no HTTP/routing. normalizeManualIsbnImport accepts only ASCII digits/space/hyphen, removes only space/hyphen and uses the unchanged isValidBarcodeIsbn13 checksum/prefix/9790 validation; ISBN-10, Unicode digits and all other characters are rejected without repair. Invalid submit marks touched and keeps the dialog open; Enter and Continuar share native form submit
- Catalog scanner/manual dialogs have separate local references and cannot duplicate or overlap; both return canonical ISBN to the same private navigation method, which revalidates without normalization and sends only /books/new?isbn=.... Cancel never navigates, destruction closes both and ignores late results; BookCreate retains all lookup/URL consumption responsibilities and Guardar remains the sole persistence path
- BookCreate consumes its initial ISBN query seed once after BookForm is rendered: exactly one isbn value passing isValidBarcodeIsbn13, no repair/trim/permissive normalization. Invalid/empty/repeated values do not fill or request; accepted seeds share scanner application, execute one existing lookup and replace the URL with /books/new without cancel/reset/retrigger. Reloading the clean URL does not lookup; a fresh explicit seeded entry does
- ZXing @zxing/browser 0.1.5 and @zxing/library 0.21.3 are pinned for Node 22; decoder modules load dynamically only during scanner use, without Angular wrapper, native second engine, CDN, OCR or AI
- Scanner accepts EAN-13 only, exactly 13 ASCII digits with 978/979 prefix, valid checksum and no 9790 (ISMN); scanner-only isValidBarcodeIsbn13 does not tighten CRUD/search/manual lookup validation
- Camera requests audio:false and facingMode ideal environment only after opening; video is muted/playsinline, one decoder session runs at 250ms intervals and stops after 60 seconds without ISBN; explicit retry/image/manual entry remain available
- Camera requires HTTPS or localhost; http://a-LAN-IP:4200 is not guaranteed to support getUserMedia, with no TLS/proxy/CORS changes
- IsbnBarcodeReader owns idempotent cleanup of frame/deadline timers, all tracks, video.srcObject, temporary image URLs and callback generation; closing/cancel/Escape/backdrop/destroy/navigation/timeout release resources, and late getUserMedia streams are stopped without attachment
- Hidden tabs stop requesting/scanning camera sessions and require explicit restart; no automatic resume, torch, zoom or advanced camera selection
- Local images accept nonempty JPEG/PNG <=10 MiB and <=20000000 decoded pixels; stop camera first, decode one image without upload/base64/preview/crop, revoke object URLs on every outcome and discard file references
- First valid detection stops the session and closes the dialog once; invalid products/checksums/formats never modify the form and camera continues with one nonblocking warning instead of per-frame announcements
- Opening scanner cancels prior ISBN lookup without auto-resume on cancel; accepted ISBN updates the control dirty while preserving touched, shows detected ISBN, then calls the same BookCreate.lookup/BooksService.lookupByIsbn/BookForm.applyLookup path
- Detected ISBN survives lookup errors and clears on manual ISBN edits; lookup preserves all existing empty-field/draft/description/genres/cover semantics and only explicit Guardar creates a book
- Barcode recognition is local, with no frames/images sent to backend or persisted; subsequent metadata lookup sends ISBN to backend/Open Library, so the complete flow is not offline
- BooksService.lookupByIsbn(isbn) uses GET /api/books/isbn-lookup with HttpParams and the raw typed ISBN; independent BookLookupResponse has isbn/title/author/publisher/publicationYear/pageCount/language/genres/coverUrl, never description
- Lookup is consultative: no persistence, book creation or local duplicate checks; manual lookup uses local empty/pattern/length guards only and backend checksum/normalization; the scanner independently validates detected ISBN-13 without changing the manual contract
- Lookup fills only currently empty text fields and null numeric fields, always replaces ISBN with the backend normalized value, never touches description, and preserves edits made during the GET; null proposals never erase values
- Lookup genres apply only with no existing chips and no pending genre text, using existing validators without merge; coverUrl copies exactly into an empty field, without image requests/preview/upload
- BookCreate owns idle/loading/success/error and one cancelable GET subscription; ISBN edits cancel and return idle without automatic requests, guarded snapshots prevent stale application, and normalized programmatic ISBN updates preserve success
- Submission attempts, Cancelar and destruction cancel lookup; createBook remains the sole persistence path and uses the existing BookRequest builder; lookup never blocks the rest of the form
- Changed lookup controls become dirty, untouched/touched is preserved, and provider errors are safe inline messages separate from CRUD field/general errors; 400/404/502/503/504/0 have specific messages, no automatic retry or Retry-After display
- BookEdit validates digit-only positive safe integer route IDs before GET, uses loading/loaded/error states and switchMap cancellation for GET only; no empty form while loading
- Preloaded text nulls become empty inputs, numbers stay numeric/null, and the form starts pristine/untouched; PUT replaces bibliographic data and the complete location representation, never a partial location patch
- coverUrl is preloaded and submitted exactly, including managed URLs; backend alone checks ownership and handles cleanup, with no URL rewriting or image manipulation in Angular
- Managed cover UI is available only in BookEdit at /books/:id/edit, outside BookRequest; BookCreate has no upload; BooksService.uploadCover(id, File) POSTs FormData with exactly field file and no manual Content-Type, returning BookResponse; deleteCover(id) sends bodyless DELETE and receives 204
- COVERS_CONFIG centralizes publicBaseUrl (development default matches backend http://localhost:8081/api/covers); configure it to match backend COVERS_PUBLIC_BASE_URL when deploying, without physical storage paths or inferred incoming origins
- isManagedCover is a fail-closed UX-only classifier: absolute HTTP/HTTPS URL, configured scheme/host/effective port/raw path, no credentials/query/fragment, exact current bookId-lowercaseUUID.jpg/png; repaired URLs and lookalike prefixes are not classified as managed, and backend remains the ownership authority
- BookEdit displays the confirmed current cover/fallback and selected filename, with no local preview; Eliminar portada is offered only for a confirmed managed cover, while external references are edited/cleared through ordinary coverUrl PUT
- File selection/upload validates presence, nonempty bytes, MIME image/jpeg or image/png, and <=5242880 bytes; original extension is ignored and backend alone validates signature/static PNG/CRC/dimensions/decode
- Upload/delete writes save immediately independent of general Guardar; one screen write at a time excludes PUT/upload/delete/reload, blocks file/actions/form/Cancelar with code guards, and no new navigation guard is introduced
- Initial BookForm preload is separate from cover confirmations: only coverUrl is synchronized after upload or DELETE+GET, replacing its manual draft but preserving all other edits, pending genres, dirty/touched and validation errors; image changes only on confirmed response, upload success clears selected file/input and failures retain it
- DELETE cover 204 triggers GET book; until confirmed synchronization no new writes are allowed; failed GET uses a distinct synchronization error and Reintentar actualización repeats only GET, never the successful DELETE
- Cover subscriptions use takeUntilDestroyed, and route ID changes cancel old cover operations and reject stale responses; cancellation on the client does not roll back a server commit
- The catalog exposes Añadir libro and each BookCard exposes accessible Ver detalle and Editar links; successful creation/editing and Cancelar navigate to /books, which reloads from the backend
- BookForm validates the existing CRUD contract, not ISBN lookup checksum; genres are trimmed, limited to 10 and unique ignoring case, with pending text resolved before submit
- Creation/edit errors are safe inline messages; known ProblemDetail fields map to server control errors cleared on editing, and 409 duplicate ISBN marks isbn
- Submission blocks duplicate POST/PUT and genre/cancel actions; no automatic retries, local cover preview or unsaved-change guard
- BookCard displays cover/fallback, title, author, readable readingStatus/rating, immediate Material status/rating selects and separate Ver detalle/Editar/Eliminar actions; the whole card is not clickable; write actions are emitted to the catalog, never HTTP in the card
- Status PATCH sends only UpdateReadingStatusRequest { readingStatus } and rating PUT sends only UpdateRatingRequest { rating: integer 1..5 }; both return BookResponse; Sin valorar uses bodyless DELETE rating (204), never PUT null
- Reading status/rating selectors explicitly restore confirmed MatSelect values before emitting; there is no optimistic update, errors preserve prior values and PATCH status never infers, changes or clears reading dates
- Catalog pendingUpdates/updateErrors are local maps by book ID; different books can update concurrently, but one pending action per book blocks both selects, Editar and Eliminar on that book; progress and safe inline errors are accessible in its card
- PATCH/PUT replaces only the visible confirmed BookResponse with page/totals preserved unless the active sort depends on the modified field; dependent sorting and DELETE rating reload the current search/sort/page/size without local reordering
- A changed query, missing visible book or pending GET at write confirmation reloads the current query through the GET cancellation chain, never inserts a book from an old page; failed reloads are load errors and never repeat successful writes
- Updates and book DELETE are globally exclusive: any pending update disables all book Eliminar buttons and guards dialog opening/confirmation; active book DELETE disables status/rating in all cards with code guards; otherwise search/sorting/pagination/Añadir remain available
- BookCard always shows Inicio/Fin with Sin fecha for nulls; Empezar lectura is available only in TO_READ, Finalizar lectura only in TO_READ/READING, and Gestionar fechas in every status
- Quick POST start-reading/finish-reading sends ReadingDateRequest { date: YYYY-MM-DD } using today's local browser year/month/day, never UTC serialization; backend confirms status and dates, no inference or optimistic change
- BookReadingDatesDialog uses Material native datepickers with strict YYYY-MM-DD parsing and local calendar conversions; Date values exist only at the UI/calendar boundary and request/response dates remain strings
- Manual PUT reading-dates replaces both nullable fields, requires at least one valid date and finishedOn >= startedOn when both exist; partial/equal/future dates are allowed, and PUT does not change status
- Eliminar fechas in the dialog uses bodyless DELETE reading-dates (204), without a second confirmation, and does not change status; PATCH status remains independent of dates
- The dialog has no HTTP: catalog owns requests, pending/error and close coordination; failed writes keep edited inputs and safe inline errors; pending blocks fields/actions, Escape and backdrop; success closes the dialog
- pendingUpdates includes startReading/finishReading/updateReadingDates/deleteReadingDates; one write per book blocks status/rating/Edit/Delete/date actions, distinct books can write concurrently, and all date writes remain globally exclusive with book DELETE
- Start/finish replaces confirmed BookResponse unless currentSort is readingStatus; manual PUT replaces it, DELETE dates always reloads; changed query/missing visible book/pending GET also reloads current search/sort/page/size through GET cancellation, without local sorting or repeating successful writes
- BookDeleteDialog is a specific Material confirmation with initial focus on Cancelar; only explicit true starts DELETE, while Escape/backdrop cancel
- Catalog deletingId allows only one DELETE; all Eliminar buttons, MatPaginator, Buscar/Limpiar búsqueda and both sorting selects are disabled with code guards, Editar is disabled only for the affected book, search inputs remain editable and Añadir libro stays available; finalize releases deletingId
- Successful catalog DELETE internally reloads the current URL query without navigation; an empty result at page > 0 navigates exactly to page - 1 with replaceUrl and URL drives the next GET once, preserving search/sort/size without local removal, total decrements or last-valid-page calculations; detail DELETE returns with context but does not trigger automatic page fallback
- Retry never navigates and reloads the current canonical URL query, not edited search inputs or obsolete failed-request state; successful writes needing reload use that same chain and request generation prevents replacement on an old query/page
- DELETE errors are safe inline messages separate from load errors and preserve cards/pagination; 404 is not success, retries require confirmation, and a failed reload never repeats DELETE
- Frontend deletion calls only DELETE /api/books/{id}; managed cover cleanup remains entirely in the backend
- Cover URLs are used unchanged by img with lazy loading; null/failed images show Sin portada, and changing coverUrl resets image failure
- MatPaginator uses page/size/totalElements, sizes 10/20/50/100, default 20 and page 0 on size changes; Spanish labels are scoped to the catalog
- Catalog errors use safe inline messages and explicit retry, not snackbars or automatic retries
- Angular Material remains the only UI library; responsive cards use native CSS Grid and local SCSS
- No additional filters (reading dates/pageCount/cover/timestamps), ISBN lookup/scanner in editing, automatic lookup except after explicit valid barcode scan or a valid initial consumable ISBN seed in creation, cover upload in creation, local cover preview/processing, reading history/multiple periods, custom interactive stars or fake runtime book data
- API_CONFIG injection token centralizes apiBaseUrl = /api; services must not scatter backend origins
- Configure provideHttpClient() in app.config.ts; no interceptors or generic API framework until actually needed
- Development proxy /api/** targets http://localhost:8081, without path rewriting or backend CORS changes
- ng serve proxy is development-only; production hosting must route /api to the backend and fall back to index.html for SPA routes
- Unit tests use HttpTestingController and do not require a running backend or access the Internet
- Co-locate *.spec.ts with source; use Material/CDK harnesses when useful
- Create shared/components/services/models only when needed; avoid empty directories and premature abstractions
- No SSR, PWA, authentication, NgRx, frontend Dockerization or additional features without explicit request
- Run commands from frontend/mi-biblioteca-web: npm install, npm start, npm run lint, npm run format:check, npm run build, npm run test:ci
- npm run format formats only the frontend; npm ci is preferred for subsequent reproducible installs
- Frontend work uses the same Git workflow: chore/* for setup/maintenance, feature/* for functionality, PRs into develop
- Never create branches, commit, push or merge automatically

---

## Java package rules

Base package:

```text
com.mibiblioteca.bookservice
```

All new Java packages must remain under this base package.

Use clear package names based on responsibility.

For example:

```text
com.mibiblioteca.bookservice.book
com.mibiblioteca.bookservice.book.api
com.mibiblioteca.bookservice.book.dto
com.mibiblioteca.bookservice.book.persistence
com.mibiblioteca.bookservice.book.service
com.mibiblioteca.bookservice.common.exception
```

Do not create empty packages unnecessarily.

---

## Coding guidelines

Use:
- constructor injection
- Spring Data JPA repositories
- DTOs at the REST API boundary
- Jakarta Validation
- clear naming
- small focused classes
- thin controllers
- business logic in services
- persistence logic in repositories

Avoid:
- field injection with @Autowired
- exposing JPA entities directly from controllers
- unnecessary abstractions
- premature generic frameworks
- unnecessary inheritance
- static utility classes when normal services are clearer
- duplicated logic

Do not add Lombok unless explicitly requested.

Prefer simple and readable code over clever code.

---

## REST API conventions

REST endpoints should use:

```text
/api/...
```

Controllers should:
- receive request DTOs
- validate input
- delegate business logic to services
- return response DTOs

Controllers must not contain persistence logic.

Use appropriate HTTP status codes.

Examples:
- 200 OK
- 201 Created
- 204 No Content
- 400 Bad Request
- 404 Not Found

---

## DTO rules

Do not expose JPA entities directly through REST endpoints.

Use dedicated request and response DTOs.

Prefer Java records for simple immutable DTOs when appropriate.

Validation belongs on request DTOs.

Examples:
- @NotBlank
- @Size
- @Pattern

---

## JPA and persistence rules

Use JPA/Hibernate for application persistence.

Hibernate must not create or modify the database schema.

Keep:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
```

Schema changes must be managed only through Flyway migrations.

Do not change ddl-auto to:
- create
- create-drop
- update

unless explicitly requested.

---

## Flyway rules

All database schema changes must use Flyway.

Migration directory:

```text
backend/book-service/src/main/resources/db/migration
```

Use Flyway naming conventions such as:

```text
V1__create_book_table.sql
V2__add_book_status.sql
V3__add_book_index.sql
```

Never edit an already-applied migration to change database history.

Create a new migration instead.

---

## Database conventions

Database:
- PostgreSQL 16

Prefer:
- snake_case table names
- snake_case column names
- explicit constraints
- appropriate indexes
- NOT NULL where the domain requires it

Do not add tables or relationships outside the requested feature.

---

## Git workflow

Branches:

```text
main
develop
feature/*
chore/*
fix/*
```

Rules:

- main is the stable branch.
- develop is the integration branch.
- New functionality starts from develop.
- Configuration or maintenance work uses chore/*.
- Bug fixes use fix/*.
- Do not commit feature work directly to main.
- Do not commit feature work directly to develop.
- Merge feature and chore branches into develop through Pull Requests.
- Later, stable releases move from develop to main through a Pull Request.

Before starting new work:
1. verify the current branch
2. verify that it was created from develop when appropriate

Do not create or rename branches unless the user requests it.

Do not push or merge unless explicitly requested.

---

## Commit conventions

Use concise Conventional Commit style messages.

Examples:

```text
feat: add book creation endpoint
feat: implement book CRUD
fix: handle missing book
chore: initialize book-service environment
test: add book service tests
refactor: simplify book mapping
docs: update project documentation
```

Do not create commits unless explicitly requested.

---

## Testing rules

New functionality should include appropriate automated tests.

At minimum:
- service-level tests for business logic
- controller tests when REST behavior needs verification
- repository/integration tests when persistence behavior needs verification

Before considering implementation complete, run:

```text
mvnw clean test
```

On Windows:

```text
.\mvnw.cmd clean test
```

Report:
- test count
- failures
- errors
- skipped tests

Do not claim tests pass unless they were actually executed.

---

## Docker rules

Docker Compose file:

```text
docker-compose.yml
```

Current service:
- PostgreSQL 16

Do not add new Docker services unless explicitly requested.

Before running commands that:
- download Docker images
- delete volumes
- remove containers
- destroy persistent data

ask for permission.

Never run:

```text
docker compose down -v
```

without explicit permission because it deletes persistent database data.

---

## External downloads and destructive actions

Ask for permission before:
- downloading new Docker images
- adding large or unexpected dependencies
- deleting files
- deleting Git branches
- force pushing
- deleting Docker volumes
- resetting Git history
- modifying files outside the repository root

Do not modify anything outside:

```text
C:\mis-proyectos\mi-biblioteca
```

unless explicitly requested.

---

## Dependency rules

Do not change:
- Java version
- Spring Boot version
- PostgreSQL version
- Maven build setup
- major dependencies

unless explicitly requested.

Current versions:

```text
Java 21
Spring Boot 3.5.16
PostgreSQL 16
```

Do not migrate to Spring Boot 4 unless explicitly requested.

---

## Scope restrictions

Do not add the following unless explicitly requested:

- authentication
- authorization
- users
- API gateway
- AI integration
- external AI providers
- messaging systems
- Kafka
- Redis
- Elasticsearch
- loans
- lending workflow
- genres as separate entities
- authors as separate entities
- microservices beyond the current scope

Do not over-engineer future requirements.

Implement only the current requested scope.

---

## Current completed state

The environment setup is complete.

Verified:
- Java 21 works
- Maven Wrapper works
- Spring Boot 3.5.16 builds successfully
- PostgreSQL 16 runs with Docker Compose
- PostgreSQL healthcheck is healthy
- book-service starts on port 8081
- Actuator health endpoint returns UP
- JPA is configured
- Flyway is configured
- Git repository is configured
- main and develop branches exist
- Basic Book CRUD is implemented
- Book search is implemented
- Book reading status is implemented
- Book rating is implemented
- Book reading dates are implemented
- Flyway migrations: V1 (book table), V2 (reading status), V3 (rating), V4 (reading dates), V5 (cover URL), V6 (book metadata), V7 (textual physical location), V8 (Room/Bookcase/Shelf and nullable Book FK, no data reconciliation)
- OpenAPI documentation is available
- Book pagination and book search pagination are implemented
- Optional external book cover URL references are implemented (referenced images are not downloaded or stored locally)
- Book bibliographic metadata is implemented (publisher, publicationYear, pageCount, language, genres)
- Consultative ISBN metadata lookup using Open Library is implemented (no persistence)
- Frontend consultative ISBN lookup is available in /books/new and explicit bulk /books/import; creation fills empty fields preserving user edits, while bulk requires BookForm review of each proposal and explicit selected individual creation
- Angular/Material frontend setup and read-only paginated /books catalog are implemented (BooksService, frontend book models, BookCard and MatPaginator)
- Frontend creation at /books/new and editing at /books/:id/edit are implemented with shared BookForm, BookRequest, createBook(), getBook(), updateBook() and Material controls
- Frontend deletion is implemented through deleteBook(), BookCard actions and BookDeleteDialog confirmation, with backend reload and one-page fallback when empty
- Frontend submitted search by title/author or exclusive ISBN is implemented with searchBooks(), currentSearch snapshot, server pagination and search-preserving DELETE reload
- Frontend server-side sorting UI is implemented for title/author/createdAt/readingStatus/rating with currentSort and ASC/DESC; search, filters, pagination, retry and DELETE preserve the applied sorting
- Frontend readingStatus and rating editing is implemented in BookCard with PATCH status, PUT rating and DELETE rating; confirmed response replacement or current-query reload preserves server sorting
- Frontend reading dates are implemented with local-today start/finish actions and a dedicated Material dialog for PUT/DELETE dates; status changes only as confirmed by the quick-action backend response
- Managed JPEG/PNG cover uploads, filesystem storage and public cover reading are implemented
- Frontend managed cover upload/delete is implemented in BookEdit with configured UX ownership classification and partial coverUrl synchronization, without upload in creation
- Frontend book detail at /books/:id is implemented with complete read-only data, shared ID/display helpers, explicit GET retry, Editar/catalog navigation and existing-dialog book deletion
- Frontend catalog URL query persistence is implemented with canonical page/size/sort/search, safe normalization, Back/Forward and detail/edit context; retry and successful-write reloads share one cancelable GET chain
- Frontend local ISBN barcode scanning in BookCreate is implemented with a Material dialog, camera/local JPEG/PNG, scanner-only ISBN-13 validation and automatic reuse of the existing consultative lookup; no scanner in editing or image upload
- Structured locations are implemented with V8, Room/Bookcase/Shelf CRUD, /locations, a shared selector and stable ID filters. V7 labels remain unchanged until explicit per-book assignment; no automatic reconciliation
- Assisted legacy reconciliation is available at /locations/reconcile: exact groups, full-group signed review, explicit Shelf selection/confirmation and atomic conversion of verified IDs. No automatic conversion, fuzzy matching, history, undo, reconciliation tables or V9

---

## Current planned feature

Book CRUD is completed.

Book search is completed.

Book reading status is completed.

Book rating is completed.

Book reading dates are completed.

OpenAPI documentation is completed.

Book pagination is completed.

Book search pagination is completed.

Book cover URL support is completed.

Book metadata is completed.

Book ISBN lookup is completed.

Frontend technical setup, paginated book catalog, book creation, editing, deletion, submitted search, server-side sorting, readingStatus/rating editing, reading dates and URL-backed server filters for readingStatus/ratingMin/yearFrom/yearTo/genre/language/publisher/room/bookcase/shelf are completed. No further filters are implemented.
Book cover upload is completed (JPEG/PNG, configurable filesystem; no NAS deployment).

No next feature is planned. Wait for explicit user instruction.

Initial Book fields:

```text
id
title
author
isbn
description
coverUrl
publisher
publicationYear
pageCount
language
genres
room
bookcase
shelf
createdAt
updatedAt
readingStatus
rating
startedOn
finishedOn
```

Current CRUD endpoints:

```text
POST   /api/books
GET    /api/books?page=0&size=20&sortBy=title&direction=ASC
GET    /api/books/{id}
PUT    /api/books/{id}
DELETE /api/books/{id}
PATCH  /api/books/{id}/reading-status
PUT    /api/books/{id}/rating
DELETE /api/books/{id}/rating
POST   /api/books/{id}/start-reading
POST   /api/books/{id}/finish-reading
PUT    /api/books/{id}/reading-dates
DELETE /api/books/{id}/reading-dates
POST   /api/books/{id}/cover
DELETE /api/books/{id}/cover
GET    /api/covers/{filename}
```

Search endpoints:

```text
GET /api/books/search?title=...
GET /api/books/search?author=...
GET /api/books/search?isbn=...
GET /api/books/search?title=...&author=...
GET /api/books/search?title=...&page=0&size=20&sortBy=title&direction=ASC
```

Search rules:

```text
- title and author: partial + case-insensitive
- title + author combined with AND
- isbn: exact match over normalized value
- isbn cannot be combined with title/author
- no search criteria returns 400
- GET /api/books/search returns BookPageResponse, not a JSON array
- no results returns an empty page with totalElements=0 and totalPages=0
- out-of-range pages return 200 with empty content and real pagination totals
- BookSearchRequest contains only title, author and isbn; BookFilterRequest contains optional catalog filters and pagination uses separate request parameters. Both list/search compose a single Specification query; search still requires a search criterion and ISBN remains exclusive with title/author, but may combine with catalog filters
- ISBN searches validate pagination and sorting just like other searches
```

Search components:

```text
BookRepository
BookService
BookController
search request DTO
validation
tests
```

Cover URL rules:

`coverUrl` can reference an external HTTP/HTTPS image or a locally managed cover.
External references do not trigger image downloads or local storage. Managed covers
are uploaded through the dedicated cover endpoint, stored in the configured filesystem
directory and exposed through a public HTTP/HTTPS URL, as described below.

```text
- coverUrl is an optional String mapped to nullable cover_url VARCHAR(2048)
- V5__add_book_cover_url.sql adds the column without a default, index or uniqueness constraint
- BookRequest validates @Size(max = 2048) and the custom Jakarta @HttpUrl constraint
- @HttpUrl uses java.net.URI only: no DNS, HTTP calls or resource checks
- only absolute HTTP/HTTPS URLs (case-insensitive scheme) with a host are accepted
- hostnames, localhost and IP addresses are accepted when URI parses them as a host
- paths, query parameters, fragments and valid percent-encoding are accepted
- an explicit port must be 1 to 65535; embedded userInfo is rejected
- null is valid; empty strings, unencoded whitespace and malformed URLs return 400 ProblemDetail with errors.coverUrl
- URLs are stored as supplied, without trim or rewriting
- POST /api/books accepts coverUrl; omission or null creates a book without a cover
- PUT /api/books/{id} replaces coverUrl; omission or null removes the reference (not a partial update)
- BookResponse includes coverUrl on creation, update, get-by-id, paginated list and paginated search
- coverUrl is not a search filter or an allowed sortBy field
- managed URLs are reserved: POST book cannot assign one; PUT can preserve only that book's current managed URL
- external URLs remain accepted, without downloading their resources
- upload/storage rules are below; ISBN lookup still returns references without downloading images
```

Cover upload and storage rules:

```text
- POST /api/books/{id}/cover consumes multipart/form-data with mandatory file, returns 200 BookResponse
- DELETE /api/books/{id}/cover returns 204; idempotent for an existing book without a cover, missing book -> 404
- GET /api/covers/{filename} returns managed binary JPEG/PNG only; invalid or missing filenames -> 404
- Components: BookCoverController, CoverContentController, BookCoverService, CoverImageValidator, CoverStorage, FileSystemCoverStorage
- CoverStorage exposes safe keys and image bytes, never physical Paths or arbitrary user URLs
- CoverStorageProperties binds storage.covers; directory defaults to ./data/covers relative to the process working directory
- COVERS_DIRECTORY overrides the physical directory; COVERS_PUBLIC_BASE_URL overrides the public HTTP/HTTPS base URL
- Public base URL has no credentials, query or fragment and is never derived from an incoming Host header
- Default public-base-url: http://localhost:8081/api/covers; directory never appears in coverUrl
- Managed files are private filesystem data, outside the classpath and target, excluded from Git
- Changing directory to an accessible mounted NAS folder requires configuration only; NAS deployment is not implemented or verified
- Preserve public origin/path when moving storage; existing absolute URLs are not rewritten automatically
- Only JPEG/image/jpeg and static PNG/image/png; WebP/GIF/SVG/APNG are unsupported (415)
- Validate presence, nonempty bytes, reported and actual bounded size, declared MIME, signature, MIME/format agreement, ImageIO reader, dimensions and full decode
- PNG chunks are bounded and CRC-checked; APNG animation chunks are rejected; truncated/corrupt images -> 400
- Preserve original image bytes; no resizing, conversion, compression, thumbnails or metadata stripping
- Maximum file 5 MiB (5242880 bytes); Spring multipart max-file-size 5MB, max-request-size 6MB
- Maximum width/height 6000, maximum pixels 20000000, positive dimensions without an aesthetic minimum
- Tomcat max-swallow-size 8MB allows bounded draining for ordinary oversized uploads to receive 413; extreme oversized clients may have their connection closed
- Generated filenames: {positive bookId}-{lowercase uuid}.jpg/.png; extension derives from detected content, original filename is ignored
- Temporary CREATE_NEW writes and same-directory move without REPLACE_EXISTING publish complete files; no overwrite or temporary GET access
- Filename whitelist rejects arbitrary names, overflow IDs, separators, absolute paths and encoded traversal
- Reject symlink files and symlink directory ancestors; managed directory must be writable only by trusted application/administrative processes
- Ownership requires configured origin, managed path, exact valid filename and matching bookId, not URL-prefix matching alone
- Upload: initial existence check, validation, full file storage, short REQUIRES_NEW TransactionTemplate, reload book, update/flush coverUrl, commit, cleanup old managed file
- New file is removed on confirmed rollback or failure to begin; cleanup failure is logged without hiding the primary error
- Unknown commit outcome retains the new file rather than risking a committed reference pointing to a deleted file
- DELETE cover clears the reference and commits before deleting the old managed file; missing physical files count as success
- PUT book removing/replacing a managed cover and DELETE book schedule identical after-commit cleanup
- Failed post-commit cleanup is logged; preserve 200/204 and never pretend the committed database change rolled back
- Global persistence handling translates only Hibernate constraint violation SQLState 23505 with exact constraint uq_book_isbn into 409 Duplicate ISBN, including stale-precheck races. Other integrity violations remain generic 500. Real PostgreSQL tests exercise actual INSERT uniqueness and an unrelated rating CHECK failure; no schema changes
- External references are replaced/cleared only; no HTTP request or resource deletion, including Open Library references
- No distributed transaction or automatic orphan sweeper; process crashes/cleanup failures can leave orphan files
- No pessimistic lock, @Version or global concurrency changes; existing last-writer semantics remain
- Sequential failure handling is coordinated, but concurrent writes/cleanup are not serializable and can leave stale references or orphan files; avoid overlapping edits of the same book in v1
- GET returns canonical real Content-Type, Content-Length, inline disposition, nosniff, public max-age=86400
- Public reading has no authentication; UUID is not authorization and caches may retain a deleted cover for one day
- Errors: 400 missing/empty/malformed/corrupt/dimensions; 404 missing book/cover; 413 size; 415 unsupported/mismatched type; 500 storage/persistence
- ProblemDetail includes errors.file or errors.coverUrl when appropriate; never expose original unsafe names, physical paths, NAS information or stack traces
- Tests use temporary directories and real PostgreSQL commits for coordination, no real NAS or external provider calls
- No migrations, new dependencies, bibliographic changes, S3/CDN/WebP/OCR/advanced image processing
```

ISBN lookup rules:

```text
- GET /api/books/isbn-lookup?isbn=... returns independent BookLookupResponse
- Consultative only: no BookRepository, duplicate checks, book creation/update or external response persistence
- Response fields: isbn, title, author, publisher, publicationYear, pageCount, language, genres, coverUrl
- isbn is the normalized requested ISBN; unknown scalar metadata is null and unknown genres is []
- Shared IsbnNormalizer preserves CRUD/search normalization exactly (remove spaces/hyphens, trim, uppercase)
- Strict checksum validation is lookup-only; never tighten existing CRUD/search ISBN validation
- ISBN-10: 9 digits plus digit/X, weighted checksum modulo 11
- ISBN-13: 13 digits, 978/979 prefix, alternating 1/3 checksum modulo 10
- Missing/blank/invalid ISBN returns 400 ProblemDetail before any external request
- Open Library current /isbn/{isbn}.json; at most one same-origin redirect to /books/OL{digits}M.json
- Optional /search.json?q=isbn:{isbn}&fields=key,author_name,subject&limit=5 enriches missing authors/genres only when edition work keys exist
- Enrichment must match an edition work key; never replace edition-specific year/publisher/pages with work aggregates
- Maximum 3 HTTP requests: ISBN, controlled edition redirect, optional search; no arbitrary URL/reference traversal
- Synchronous RestClient with Java 21 JDK HttpClient; no SDK, WebClient or new dependencies
- @ConfigurationProperties prefix external.books.open-library centralizes base-url, covers-base-url, timeouts, user-agent and optional contact
- Defaults: connect 1s, request 3s, total lookup 8s; each request is bounded by remaining budget
- Virtual-thread execution only bounds synchronous request/body reading and allows cancellation; no asynchronous REST contract
- No provider calls at startup, no retries, cache, rate limiter, fallback or bulk lookup
- External JSON is parsed internally as JsonNode to tolerate incorrect optional types; principal response must be an edition object with a valid edition key
- title: trim, blank/over 255 -> null; publisher: first valid trimmed value of at most 255 characters
- pageCount: positive integral number within Integer range only
- Authors: trim, case-insensitive deduplication preserving first spelling/order, join with '; ', retain only whole names fitting 255 characters
- language: lowercase ISO 639-1; Java ISO3 mapping plus bibliographic aliases (including fre/ger); unknown or conflicting languages -> null
- publicationYear: bare year, strict ISO date/year-month, or recognized English textual date; only 1–2100; ambiguous dates/ranges/circa -> null
- Never use first_publish_year for edition publicationYear
- genres: trim, discard null/blank/non-text/over 50, deduplicate ignoring case with Locale.ROOT, first spelling/order, first 10 valid values
- Optional malformed metadata is discarded; valid partial proposals return 200; user-entered CRUD validation remains strict
- Positive integral cover identifier produces HTTPS covers-base-url /b/id/{id}-L.jpg?default=false
- Offered cover URLs use existing syntax-only HttpUrlValidator and maximum 2048; no image GET/HEAD/download/storage
- 404: valid ISBN with no edition; 502: malformed/incompatible provider response or unsafe/repeated redirect
- 503: connection/transport failure, upstream 429 or 5xx; valid upstream 429 Retry-After can be propagated
- 504: request/connect timeout or exhausted total budget
- Attempted enrichment failure uses the same errors rather than silently hiding provider failures
- Errors use safe ProblemDetail messages: no upstream bodies, stack traces or configuration URLs
- Offline tests use MockRestServiceServer, mocked transport timeouts and a controllable budget clock
- No changes to Book, database schema, Flyway migrations or dependencies
```

Physical location rules:

```text
- V7__add_book_location.sql adds nullable room VARCHAR(100), bookcase VARCHAR(100), shelf VARCHAR(50); no defaults, tables, FK, indexes or uniqueness constraints; never alter V1-V6
- POST omission/null/blank means null; PUT replaces all three and omission/null/blank clears prior values; all BookResponse operations include all three nullable fields
- Single-line labels allow Unicode names/accents, normal spaces and punctuation. Raw lengths are validated before trimming; Cc controls (NUL/tab/CR/LF/C1/DEL) and Zl/Zp line/paragraph separators are rejected. Exterior space separators/BOM are trimmed consistently with frontend; inner spaces/case/accents remain unchanged
- (room, bookcase, shelf) remains a legacy textual criterion, NOT a stable shelf identity. V8 supplies a separate Room -> Bookcase -> Shelf hierarchy and nullable book.shelf_id; existing V7 data is NOT converted, cleaned, deduplicated or associated automatically. Reconciliation remains a separately approved feature
- Autocomplete from authoritative distinct values is a future feature; do not derive suggestions from one catalog page, load all books or add distinct endpoints now
- Real PostgreSQL 16 tests cover Salón == salón and Salón != Salon, literal wildcards, combined filters, count/paging, V6 data preservation through V7 and Hibernate ddl-auto validate
```

Assisted legacy reconciliation (no schema migration):

```text
- Package location.reconciliation owns the dedicated controller/service/SQL repository, DTOs, ReviewToken and ReviewTokenProperties. GET /api/locations/reconciliation accepts page>=0,size=1..100,type=ALL|COMPLETE|PARTIAL,text<=255; returns paginated groups with global pendingGroups/pendingBooks/completeGroups/partialGroups. List rows never contain Book entities or complete ID arrays
- Only shelf_id IS NULL with at least one effective legacy label participates. PostgreSQL lower(nullif(btrim(label, explicit Unicode Zs+BOM set),'')) defines grouping and suggestions: case-insensitive/accent-sensitive, no fuzzy matching, punctuation/interior spacing preserved. Group representative is the original tuple of the lowest book ID, variants/counts are explicit. Grouping is not proof of physical identity
- groupKey is opaque to clients: base64url of an unambiguous canonical JSON tuple with nulls. It identifies the tuple, not physical location or group version. GET /api/locations/reconciliation/{groupKey} returns original variants, paginated lightweight books and a review of the entire group. snapshotFingerprint allows detecting changed membership while paging without decoding the token
- reviewToken uses JDK HMAC-SHA256 over version/groupKey/count/SHA-256 fingerprint/issuedAt/expiresAt. Fingerprint is ordered book ID plus original room/bookcase/shelf using length-prefixed UTF-8 and distinct null encoding. No bibliographic data, no xmin, no @Version and no reliance on updatedAt. Current-state verification cannot detect a change away and back to identical originals; this is not history
- locations.reconciliation.secret / RECONCILIATION_SECRET configures at least 32 UTF-8 bytes; absent/blank generates a random process-local key with warning. Configure the same secret across instances and restarts for review continuity; tokens are signed, not encrypted, and are not authorization. locations.reconciliation.ttl / RECONCILIATION_TTL defaults 15m, positive and at most 1h; never log secrets/tokens
- POST /api/locations/reconciliation/assign accepts reviewToken,shelfId,expectedDestination {room,bookcase,shelf}. Short REPEATABLE READ transaction locks Room->Bookcase->Shelf FOR SHARE, books in ascending ID FOR UPDATE; verifies full count/fingerprint and exact destination names, then updates only the verified locked IDs with a bound array. Sets shelf_id, clears all legacy columns, updates updated_at; mismatched affected count rolls back all. No per-book CRUD loop or open name-predicate UPDATE
- Members added/removed/changed before the confirmation transaction's snapshot invalidate the review (409). Concurrent modifications of snapshot rows cause a conflict, not overwrite. Books inserted after that snapshot are never included and remain pending; no table-wide write locks are introduced. Existing last-writer Book PUT semantics still apply after commit; no global optimistic-locking change
- Malformed requests/tokens/IDs ->400; absent detail group/destination ->404; expired review ->409 RECONCILIATION_EXPIRED, changed group/concurrency ->409 RECONCILIATION_STALE, renamed destination ->409 RECONCILIATION_DESTINATION_CHANGED. Deadlock/serialization errors at the reconciliation controller are safe conflicts; no automatic write retry
- Only COMPLETE groups with a unique exact normalized full route get EXACT suggestion. NONE/AMBIGUOUS/NOT_APPLICABLE never choose a target; even EXACT requires explicit selection. PARTIAL may be assigned manually to a full Shelf or left pending, never fabricate parents/shelf or infer same physical location. Different destinations within a group require existing individual book editing, not auto-split or legacy bulk correction
- Lazy /locations/reconcile is linked as Conciliar ubicaciones anteriores from /locations. Uses Material table, mobile local CSS, explicit Apply/Clear type/text filters, server pagination, lazy paginated group-books dialog and confirmation showing originals/count/full destination/no-undo notice. Ver libros never uses catalog effective-name filters
- Reuses LocationSelector/LocationEditor and existing explicit hierarchy creation dialogs/CRUD; creations persist immediately even if reconciliation is cancelled. Suggestion never auto-selects. One active group review and one POST at a time; blocks destination changes/duplicate writes and invalidates stale reviews. No localStorage/sessionStorage or persistence of session counts
- Only confirmed POST responses increment page-local session group/book counts. Success reloads backend groups/stats; failed reload retries GET only. Network/5xx outcome is uncertain: refresh/reopen, never automatically repeat POST or invent a session success. Cancellation on client does not roll back a server commit
- Legacy data stays intact until explicit confirmed conversion. No V9/new indexes/tables/history/undo/automatic cleanup/fuzzy matching/general mass moves/AI/OCR/photos/InventorySession. PostgreSQL tests exercise real commits, locks, stale membership, atomic rollback and two concurrent confirmations; frontend tests are offline
```

Structured library locations (V8):

```text
- Package com.mibiblioteca.bookservice.location contains Room, Bookcase, Shelf, repositories, DTOs, service and controller. Parents are mandatory, immutable in this feature; PUT renames only. Names validate raw 100/100/50 length, reject Cc/Zl/Zp, trim exterior Unicode space separators/BOM, require a nonempty result, preserve case/accents/interior spacing/punctuation
- Unique indexes: lower(room.name), (bookcase.room_id,lower(name)), (shelf.bookcase_id,lower(name)); accent-sensitive PostgreSQL equality, no extensions. Parent-prefixed unique indexes are not duplicated. book(shelf_id) has a single index. Restrictive FKs and ck_book_location forbid structured FK alongside legacy labels; no cascading persistence/removal
- GET /api/locations returns DTO hierarchy/counts/canDelete/blockedReason with four bounded queries, no Books. Counts include only structured assignments. Book list/detail use entity graphs to fetch the to-one hierarchy without N+1; names are derived, never cached into V7 columns
- POST/PUT/DELETE /api/rooms, /api/bookcases, /api/shelves manage hierarchy; creation takes parent ID, renaming only name. Shelf with books, Bookcase with shelves and Room with bookcases block deletion (409 LOCATION_IN_USE); duplicate scoped names give 409 LOCATION_NAME_CONFLICT. Actual database constraint races are safely translated, never expose SQL constraint names
- BookResponse keeps effective room/bookcase/shelf names and adds nullable roomId/bookcaseId/shelfId plus locationPending=true only for nonempty legacy labels. POST/PUT accept explicit SHELF or LEGACY location, location:null clears, omitted new field uses full-replacement V7 contract. JSON property presence rejects dual representation even with explicit nulls. Explicit assignment clears legacy; LEGACY never resolves names to IDs
- PUT /api/books/{id}/location accepts exactly {shelfId:positiveSafeInteger|null}; assigning verifies Shelf existence, null clears both representations, returns BookResponse. No mass move/move-all, history, archival, photos, OCR/AI or InventorySession
- roomId/bookcaseId/shelfId scalar filters accept one digit-only positive safe integer, combine AND with existing name filters/search/pagination. Valid nonexistent IDs match zero books and are never removed by frontend. Name filters match structured effective names OR V7 labels, exact case-insensitive/accent-sensitive, without invented associations
- /locations lazy standalone page uses Material expansion panels, explicit name/delete dialogs, confirmed reloads, safe inline errors and shelfId links into existing /books. Main navigation links to it. Names, not IDs, are displayed
- BookForm owns typed shelfId and emits UI events, no HTTP/routing. LocationSelector has dependent Material selects, clears descendants, blocks partial structured saves, supports preserve/edit legacy, explicit replace and clear. Create/Edit/ImportReview use page-scoped LocationEditor to load hierarchy on explicit Elegir balda, create via dialogs and refresh; no extra lookup/scanner-triggered location HTTP
- Location entities created from the form persist immediately even if Book is later cancelled; UI states this. Drafts/confirmed import selections are independent by row, no catalog-filter seeding or Apply-to-all. Lookup never touches shelfId or legacy location. Missing/deleted location requires explicit review/reselection, not duplicate ISBN handling or automatic POST retry
- Catalog has ID selects (loads hierarchy explicitly), retains old text bookmarks and normal Apply/Clear/DELETE guards; shared URL helpers preserve IDs through reload/Back/Forward/detail/edit/import. New selections and Ver libros use IDs; no automatic text bookmark reconciliation
- Future InventorySession should reference Shelf ID and own scan photos/observations plus expected-books/name snapshots. No such entities now. Legacy columns may be removed only after reviewed reconciliation and client retirement; no destructive migration is scheduled
```

Metadata rules:

```text
- V6__add_book_metadata.sql adds publisher, publication_year, page_count, language and genres
- publisher: nullable VARCHAR(255), maximum 255 input characters; trim outer spaces and map the resulting empty string to null
- publicationYear: nullable Integer/INTEGER, 1 to 2100; null means unknown
- pageCount: nullable Integer/INTEGER, strictly positive; null means unknown
- decimal values for integer fields are rejected using the existing Jackson configuration
- language: nullable VARCHAR(2), two ASCII letters recognized by Locale.getISOLanguages()
- language accepts either case and is stored in lowercase using Locale.ROOT; blank, unknown codes and regional tags are invalid
- genres: List<String> mapped natively with Hibernate @JdbcTypeCode(SqlTypes.ARRAY) to PostgreSQL VARCHAR(50)[]
- genres is NOT NULL with database default '{}'; no entity, association table or @ElementCollection
- maximum 10 genres and 50 input characters per genre; null/empty/blank elements are invalid
- trim genre outer spaces, preserve case and order, and reject duplicates after trim ignoring case using Locale.ROOT
- omitted/null/[] genres are stored and returned as []
- POST omitted scalar metadata becomes null; PUT replaces metadata and omitted/null scalar fields remove previous values
- PUT omitted/null/[] genres removes all previous genres
- metadata appears in BookResponse for CRUD, paginated list and paginated search
- publisher/publicationYear/language/genres have optional catalog filters through BookFilterRequest; pageCount is not a filter. Metadata fields remain outside the sort whitelist, with no dedicated metadata endpoints
- invalid metadata returns the existing 400 ProblemDetail with field errors, including genres and genres[index]
- V6 CHECKs enforce year/page ranges, lowercase two-letter language format, genre count and absence of null array elements
- no new indexes, external integrations or dependencies are required
```

Reading status rules:

```text
TO_READ (default)
READING
READ
ABANDONED
```

Update endpoint:

```text
PATCH /api/books/{id}/reading-status
```

Rating rules:

```text
- Optional integer from 1 to 5
- null means not rated
- PUT /api/books/{id}/rating sets a rating
- DELETE /api/books/{id}/rating clears it
- The rating is independent of reading status
```

Persist enums as STRING. When the allowed values need database enforcement, add a CHECK constraint through a new Flyway migration.
Optional constrained fields such as rating should also be protected with a database CHECK constraint.

Reading dates rules:

```text
- startedOn and finishedOn are LocalDate values persisted as DATE
- finishedOn cannot be earlier than startedOn
- start-reading: TO_READ -> READING
- finish-reading: TO_READ or READING -> READ
- PATCH /reading-status does not change dates
- ABANDONED preserves existing dates
```

Pagination rules:

```text
- GET /api/books returns BookPageResponse, not a JSON array
- Defaults: page=0, size=20, sortBy=title, direction=ASC
- page is zero-based; size must be 1 to 100
- sortBy is limited to id, title, author, createdAt, updatedAt, readingStatus, rating, startedOn, finishedOn
- id ASC is used as a secondary sort except when sortBy=id
- applies to GET /api/books and GET /api/books/search
- direction accepts only ASC or DESC
- invalid parameters return 400 ProblemDetail
- native MVC method validation preserves field/parameter details in the errors map
```

Do not implement additional fields or relationships unless requested.

---

## API documentation

- Swagger UI: `/swagger-ui.html`
- OpenAPI JSON: `/v3/api-docs`
- Spring Boot 3.x uses `springdoc-openapi-starter-webmvc-ui` 2.x. Do not use springdoc 3.x unless Spring Boot is migrated to 4.x.
- Add `@Operation` and the relevant error `@ApiResponse` annotations to every new REST endpoint.
- Do not duplicate validation constraints or obvious parameter metadata that springdoc infers from Spring MVC and Jakarta Validation.
- Update `OpenApiDocumentationTest` when API routes change.

---

## Agent working rules

Before modifying files:

1. Read this AGENTS.md.
2. Inspect the current Git branch.
3. Inspect the existing project structure.
4. Inspect relevant existing files before overwriting anything.
5. Preserve working code.
6. Stay within the requested scope.
7. Explain significant architectural decisions.
8. Ask before destructive operations.
9. Ask before unexpected external downloads.
10. Do not silently change versions or architecture.

When a task is complete, report:

- files created
- files modified
- important implementation decisions
- commands executed
- test results
- any remaining issues

Do not automatically start the next feature.

Wait for explicit user instruction.

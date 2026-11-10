# Bibliographic resolution — Stages 3 and 10

No photos are sent to Open Library. Recognition is independent (mock or explicitly
authorized OpenAI); bibliographic search sends only text/ISBN/work identifiers. No AI SDK,
credentials, schema changes, Book writes or reading-list changes are introduced.

## Endpoints

* `GET /api/books/metadata-search?title=...&author=...`: either or both criteria,
  trimmed single-line text, at most 255 raw characters each. Repeated scalars,
  present blanks, controls and overlong values are rejected (400). Returns
  `{content: Work[], truncated}`: at most 10 ranked Open Library work results.
  Work includes workKey, title, authors, coverUrl, firstPublicationYear,
  editionCount. **No work ISBN or edition year** is inferred. Refine the text to
  explore beyond the first ten works rather than enumerating a provider catalog.
* `GET /api/books/metadata-editions?workKey=/works/OL1W&page=0`: fixed size 10,
  page 0..9 (at most 100 upstream entries). The only accepted work key pattern is
  `/works/OL[0-9]{1,12}W`. URLs, traversal and unrelated keys are rejected.
  Returns workKey, page, content, hasNext. Each entry has editionKey, valid checksum
  isbns (up to ten) and metadata using the existing OpenLibraryMapper. Edition
  ISBN starts null until the human selects an identifier. publish_date is used for
  publicationYear, never work first_publish_year. Explicitly mismatched work
  associations and unsafe edition identifiers are discarded.
* `GET /api/books/metadata-duplicates?isbn=...&title=...&author=...`: independent,
  read-only advisory check on the local catalog. ISBN evidence is preserved,
  limited to 50 raw characters, normalized with the existing normalizer and
  checksum-validated with the existing validator. Valid ISBN-10 and 978-ISBN-13
  are converted mathematically to equivalents; 979 ISBNs have no ISBN-10 form.
  No digits are guessed or repaired. Invalid ISBN is reported, not used as an
  exact-match criterion. Title/author have the same bounds as metadata-search.
* Existing `GET /api/books/isbn-lookup?isbn=...` is reused unchanged for ISBN
  resolution. Existing CRUD, scanner and batch ISBN-import rules are unchanged.

Duplicate response: originalIsbn, normalizedIsbn, validIsbn, equivalentIsbns,
matches, truncated, similarityChecked. Match kinds are EXACT_ISBN,
EQUIVALENT_ISBN and POSSIBLE_TITLE_AUTHOR. At most 20 exact/equivalent plus 20
possible matches; books already found by ISBN are not repeated. Possible matching
uses case-insensitive literal title AND author substrings (% and _ escaped), not
fuzzy identity or an edition-conflict decision. Missing title or author leaves
similarityChecked=false. No matches is not a guarantee of a new book. Database
errors propagate as errors, never as an empty/new result. No candidate is blocked.

## Shared provider transport and limits

The existing OpenLibraryClient, RestClient, configured origin, User-Agent,
request/connect timeouts and 8s total budget are reused. A shared per-client gate
paces **all** operations, including existing ISBN redirects/enrichment, at one
request/second. Waiting consumes the lookup budget. A valid upstream 429
Retry-After (seconds or HTTP date) starts a shared cooldown; other operations fail
with safe 503 + Retry-After without calling upstream during that interval.
The client never automatically retries. This is process-local, not distributed.

Every upstream JSON body is now bounded to 2 MiB before parsing. Work/edition
lists exceeding the requested size fail (502); safe partial fields remain nullable.
Only configured-origin routes built by the server are requested. The existing
ISBN single safe edition redirect remains supported; new metadata endpoints do
not follow redirects. No arbitrary image, author or metadata URL traversal.
External 429/5xx/transport failures ->503; timeout/budget exhaustion ->504;
invalid provider status/JSON/oversized response ->502. Existing safe ProblemDetail
handling propagates valid Retry-After. A missing work currently uses 502, since
the client does not expose arbitrary provider 404 bodies.

## Angular

Each recognized observation has an independent page-local candidate component,
associated with its original photo. Original visible text/raw ISBN stay evidence;
editable title/author/ISBN drafts do not change that evidence. Every edit cancels
pending HTTP, invalidates chosen data and duplicate state, and rejects obsolete
request generations. No requests occur just from showing/editing an observation.

Buscar coincidencias uses a checksum-valid ISBN first; invalid ISBN displays a
warning and permits title/author search. Buscar solo título y autor remains explicit;
Stage 10 also falls back after definitive ISBN absence when text is available.
Works require explicit edition selection; edition
ISBN is a separate explicit choice. Every searched identification/selected work,
edition or ISBN gets an advisory catalog check. Failures are unknown, not new.
Partial metadata (especially authors that are only references in edition data)
remains unknown, not silently copied from a work. Manual continuation retains only
the draft in memory and checks duplicates; it is not a Book form or a save action.

Covers are unchanged provider references loaded lazily by the browser with a
fallback. Loading a cover sends an image request to the cover host, never the
user's photograph. Simulation labels remain visible even when a subsequent real
Open Library text search finds genuine bibliography. Errors are local to each
observation, no indefinite retries, no storage persistence. Client cancellation
cannot guarantee interruption of an already running synchronous backend request.

## Tests and remaining limitations

Tests use mocked Open Library HTTP responses, no Internet. Persistence tests use
the existing fail-closed isolated PostgreSQL configuration and rollback fixtures.
No original bookdb access is required. There is no fuzzy catalog matching, author-reference hydration,
automatic work/edition merge or ISBN-less identity guarantee. Manual mobile and
screen-reader validation and real-provider availability checks are not automated.

## Stage 10 — bounded intelligent resolution

### Diagnosis and documentation consulted

The previous implementation made **one** `title` + `author` request (AND constraints),
returned the provider's first ten works without local relevance ranking, and had no
language preference or alternative after zero useful works. A full translated title
plus a punctuation-sensitive author therefore had no recovery path. It is not evidence
that the translated edition is absent. There is also a confirmed local mapping defect:
the API documentation includes work keys such as `OL27448W`, but the old mapper
accepted only `/works/OL27448W`. Both formats now canonicalize to the latter before
deduplication. `num_found` and `numFound` are both understood.

No live bibliographic query was made to reproduce the user's particular Harry Potter
response. The relative contribution of restrictive query/indexing and rejected keys
in that response remains unproven, not silently attributed to missing Spanish data.

Official documentation consulted during implementation (documentation only, no
provider searches or OpenAI requests):

- <https://openlibrary.org/dev/docs/api/search>: `lang=es` boosts Spanish without
  excluding other languages. `language:spa` is an explicit filter. Work documents
  can include `editions.docs`, with the best matching edition. **Only one nested
  edition is currently documented; nested edition pagination is not supported.**
- <https://openlibrary.org/search/howto>: `language`, `publisher`, `publish_year`
  and literal text searches. The edition's year is not `first_publish_year`.
- <https://openlibrary.org/dev/docs/api/books>: existing identifier-oriented lookup
  remains independent; no additional provider SDK or paid metadata model is used.
- Official implementation reference, linked from the Search API documentation:
  <https://github.com/internetarchive/openlibrary/blob/master/openlibrary/plugins/worksearch/schemes/works.py>.
  It confirms title alternative indexing, AND-combined public title/author parameters,
  edition forwarding of language/publisher/year/ISBN, and one nested edition per work.
  Indexing translations is supported; the exact reported zero-result response is not
  reproducible from code inspection alone.

### Backward-compatible optional parameters

`GET /api/books/metadata-search` retains the original title/author-only behavior for
old callers. New optional scalars:

- `smart=true|false` (strict spelling). With true, try up to **four distinct queries**:
  original title/author, punctuation/space-normalized title/author, title + last author
  token, then a broader literal title prefix (first two words when title exceeds three
  words) without author. No translated/original title is invented. Author last-token
  handling is a fallback heuristic, not a claim about surname conventions.
- `language=<recognized lowercase ISO 639-1>|all`, preference only. Angular initially
  chooses `es`; `en`, `all`, French/German/Italian/Portuguese are also exposed.
- All variants share **one configured total deadline (default 8s)** and the existing
  one-request-per-second pacing gate. Stop at useful mapped results; external errors
  terminate with their safe 502/503/504 and Retry-After, not an empty result or error
  retry. Normalized duplicate queries are not sent twice.
- Deduplicate canonical work IDs and rank exact normalized title+author text first,
  then literal title-word overlap and author last-token matches. Provider `lang`
  preference orders language relevance upstream. Ranking weights are internal ordering
  heuristics, never probabilities or identity. `Work.matchKind` is additive:
  `EXACT_TEXT`, `APPROXIMATE`, or `UNASSESSED` for legacy callers. At most ten works.

Visible valid ISBN still uses the unchanged `/isbn-lookup` first. Only a definitive
404 with sufficient title/author invokes text resolution; 5xx/network/timeouts do not
trigger more provider calls. Thus a candidate has at most two bounded phases: lookup
(default 8s, existing maximum three provider requests), then text (8s/up to four).
Cancellation on the browser may not interrupt backend work already sent.

### Edition selector and actual filter scope

`GET /api/books/metadata-editions` without filters keeps fixed pages of ten, page
0..9, at most 100 entries. No automatic enumeration of the 400+ editions of a work.

New optional scalar `language`, `title`, `publisher`, `year`, `isbn` switch to indexed
edition search. Filtered mode accepts **page 0 only**. Text uses the existing raw
255-character/single-line constraints; year must be 1..2100; ISBN must have a valid
checksum. Repeated scalars/present blanks are 400. `all` removes the language filter.

The server sends one bounded `/search.json` query scoped to the canonical work key,
requesting only the best nested edition key, then hydrates that edition with at most
one additional fixed-origin `/books/OL…M.json` request. Both share the same 8s budget
and pacing gate; no arbitrary URL traversal or extra author/image requests. Text is
quoted/escaped, identifiers checked, and the returned edition's language/title/
publisher/year/ISBN are verified against filters (including ISBN equivalence). Explicit
different-work association is rejected; absent association remains unknown as before.

Response adds `partial`: true for indexed filtering, false for legacy page mode.
Filtered results have at most one candidate and `hasNext=false`. **That does not mean
there are no other matches**. The search spans the work index rather than only ten
visible editions, but Open Library does not expose nested edition pagination. A best
index hit with missing/mismatching edition metadata can yield no verified candidate,
even if another matching edition exists. Change filters, explore bounded unfiltered
pages, use a known ISBN or continue manually. No indiscriminate edition download.

Angular uses a dedicated expandable selection panel, compact responsive grids, first
three ranked works (explicit Ver más for up to ten), covers with fallback and full
edition identifiers/metadata. Spanish editions are displayed first within a fetched
page when preferred; explicit global edition filtering can find Spanish candidates
beyond that page. Filter drafts/navigation do not cause requests; only submit/page
buttons do. ISBN, work and edition choices remain explicit; no visual cover selection.

### Batch behavior and integrity

Resultados exposes **Buscar metadatos de todos los libros**. It processes eligible
pending observation editors sequentially, excluding insufficient/invalid, discarded,
confirmed/imported/uncertain/manual and already-current successful searches (including
known empty results). A page-local search key includes edited criteria and language;
changes allow a fresh explicit search. Errors can be retried by an explicit new batch.
An existing active individual search prevents starting a concurrent batch.

Global/per-candidate progress, stop, stale generation checks and independent errors
retain successful matches. Navigation keeps the stable editor instances and photo
association. Stopping cancels the active GET and queue, retaining completed results;
it cannot revoke requests already sent upstream. 429 cooldown is shared with all
Open Library operations: later queue rows receive errors without bypassing Retry-After.
Batch does not fetch editions for every work, call OpenAI, confirm review, select
import rows, create Books, or append reading-list entries.

Cards distinguish pending/searching/one or multiple matches/none/error and existing
review/import states. A proposed work cover is explicitly marked with work title/key,
not mistaken for a confirmed edition cover. Suggestions never overwrite confirmed
BookForm corrections. Existing ISBN exact/equivalent, title-author, within-batch and
unknown-on-error duplicate protections remain unchanged. Partial selected import is
allowed; Revisar libros and Continuar a importación appear according to pending and
ready candidates respectively.

### Remaining manual checks

Automated tests use simulated transports only. Still pending: real index behavior for
the reported Spanish title/author, edition field completeness, publisher variants,
translated-title indexing, response latency within budgets, and browser/mobile/screen
reader usability. Partial index results are proposals, not proof of identity or absence.
No real provider calls, API-key access, migrations, dependencies, CRUD/list contract
changes, original database or backup modifications are part of Stage 10.

### Stage 10 changed-file inventory

Created (paths relative to `backend/book-service/`):

- `src/main/java/com/mibiblioteca/bookservice/book/lookup/MetadataSearchStrategy.java`
- `src/test/java/com/mibiblioteca/bookservice/book/lookup/MetadataSmartSearchTest.java`

Modified backend (same base):

- `METADATA-SEARCH.md`
- `src/main/java/com/mibiblioteca/bookservice/book/lookup/MetadataController.java`
- `src/main/java/com/mibiblioteca/bookservice/book/lookup/MetadataDtos.java`
- `src/main/java/com/mibiblioteca/bookservice/book/lookup/MetadataService.java`
- `src/main/java/com/mibiblioteca/bookservice/book/lookup/OpenLibraryClient.java`
- `src/test/java/com/mibiblioteca/bookservice/OpenApiDocumentationTest.java`
- `src/test/java/com/mibiblioteca/bookservice/book/lookup/MetadataControllerTest.java`
- `src/test/java/com/mibiblioteca/bookservice/book/lookup/OpenLibraryClientTest.java`

Modified frontend (paths relative to `frontend/mi-biblioteca-web/src/app/features/books/`):

- `components/photo-metadata-candidate/photo-metadata-candidate.ts`
- `components/photo-metadata-candidate/photo-metadata-candidate.html`
- `components/photo-metadata-candidate/photo-metadata-candidate.scss`
- `components/photo-metadata-candidate/photo-metadata-candidate.spec.ts`
- `models/book-metadata.models.ts`
- `services/books.service.ts`
- `pages/book-photo-import/book-photo-import.ts`
- `pages/book-photo-import/book-photo-import.html`
- `pages/book-photo-import/book-photo-import.wizard.spec.ts`
- `pages/book-photo-import/photo-candidate-card.ts`

### Validation commands

From `backend/book-service` (the helper loads only isolated PostgreSQL credentials,
without printing them; the test classpath guard rejects the original database):

```powershell
. ../../scripts/Use-TestDatabase.ps1
.\mvnw.cmd clean test '-Dspring.test.context.cache.maxSize=4'
```

From `frontend/mi-biblioteca-web`:

```powershell
npm run test:ci
npm run lint
npm run format:check
npm run build
```

From the repository root: `git diff --check`. Formatting was applied with the
existing Prettier installation; no packages or lockfiles were changed. All provider
responses in automated tests are fixtures/mocks, not real bibliographic queries.

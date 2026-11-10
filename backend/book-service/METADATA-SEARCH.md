# Bibliographic resolution — Stage 3

No photos are sent to Open Library. Recognition remains explicitly simulated;
only an explicit bibliographic search sends text/ISBN/work identifiers. No AI SDK,
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
warning and permits title/author search. Buscar solo título y autor is explicit,
including after ISBN not-found. Works require explicit edition selection; edition
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
No original bookdb access is required. There is no bibliographic ranking beyond
Open Library's relevance order, fuzzy catalog matching, author-reference hydration,
automatic work/edition merge or ISBN-less identity guarantee. Manual mobile and
screen-reader validation and real-provider availability checks are not automated.

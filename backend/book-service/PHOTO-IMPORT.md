# Photo recognition — Stage 2

Historical Stage 2 description. Stage 6 adds an explicitly enabled real OpenAI
adapter; see [PHOTO-IMPORT-OPENAI.md](PHOTO-IMPORT-OPENAI.md) for current modes,
privacy, configuration and the separately authorized first-test procedure.

This stage contains **no real recognition provider**. The mock always returns the
same fictional demonstration, unrelated to the uploaded photograph. No external
requests, metadata lookup, Book creation or reading-list changes are performed.
There are no entities, repositories, sessions or migrations for this feature.

## Configuration and safe development

Default configuration is disabled (`photo-import.enabled=false`, provider `none`).
The capabilities endpoint remains available. To enable simulation, all of the
following must be set explicitly:

```text
SPRING_PROFILES_ACTIVE=dev
PHOTO_IMPORT_ENABLED=true
PHOTO_IMPORT_PROVIDER=mock
```

Only active profiles `dev` and/or `test` are allowed when enabled. Missing profiles,
`prod`, `production`, mixed development/production or other profiles, an unknown
provider, or a missing provider bean fail startup. There is no silent fallback.
No API key is required. Never expose this unauthenticated development endpoint to
an untrusted network.

For a manual isolated launch, use the existing test database environment without
printing its credentials. From the repository root in PowerShell:

```powershell
. ./scripts/Use-TestDatabase.ps1
$env:DB_URL = $env:TEST_DB_URL
$env:DB_USER = $env:TEST_DB_USERNAME
$env:DB_PASSWORD = $env:TEST_DB_PASSWORD
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:PHOTO_IMPORT_ENABLED = 'true'
$env:PHOTO_IMPORT_PROVIDER = 'mock'
# Only use a previously prepared V11 test database. Do not migrate it on startup.
$env:SPRING_FLYWAY_ENABLED = 'false'
Set-Location backend/book-service
.\mvnw.cmd spring-boot:run
```

Use a separate shell, check that port 8081 is free first, and do not run suites
against that same database while the server is running. Do not launch against
`bookdb`. See `TESTING.md` for the test-cluster identity and fail-closed test guards.
This manual launch was not performed as part of implementation.

## REST contract

* `GET /api/book-photo-import/capabilities`: enabled, provider, mode (`DISABLED` or
  `SIMULATED`), simulated, allowedFormats, maxFileBytes, maxWidth, maxHeight,
  maxPixels, maxObservations, maxConcurrentAnalyses, analysisTimeoutMillis.
* `POST /api/book-photo-import/recognize`: multipart with exactly one `file` and
  one required `rotation`: canonical `0`, `90`, `180` or `270` (clockwise).
* Response: requestId, provider, simulated, observations (id, visibleText, title,
  author, rawIsbn, legibility, warnings), incomplete and warnings. No confidence
  percentages or generated ISBN. A requestId is only correlation, not a retrievable
  session or an idempotency key. Empty/incomplete results are valid and explicit.

ProblemDetail errors: 400 invalid photo/EXIF/rotation, 413 size, 415 unsupported or
mismatched content, 429 capacity, 500 local processing, 502 failed/invalid provider,
503 disabled, 504 deadline. Domain failures add a safe code and field errors when
applicable. Multipart-parser errors retain the existing global ProblemDetail format.

## Image safety and orientation

Shared `ImageContentValidator` preserves cover-upload validation and original cover
bytes. Photos use the same bounded byte reads, signatures, matching MIME, PNG CRC,
APNG rejection, dimensions-before-decode, full decode and warning checks. No cover
storage is used. There is no filesystem image cache in this pipeline.

Photo EXIF orientation (all 8 values, including mirrors) is read from bounded JPEG
APP1 or PNG eXIf TIFF IFD0 data. Invalid/conflicting orientation is rejected. The
original decoded pixels are mapped through EXIF first and then the requested
manual rotation, **in a single pixel reconstruction**. The provider gets only a
new PNG without EXIF, GPS, text, thumbnails, original filename or original bytes.
Dimensions/pixels are preserved except swapping axes; there is no downsampling or
lossy JPEG recompression. Browser previews already honor EXIF: Angular sends the
unmodified original plus the manual angle, not an already rotated canvas.

Spring multipart may temporarily spool request parts to disk; normal servlet
cleanup applies. That is distinct from persistent photo storage. No images,
base64, original names, provider payloads or sensitive EXIF values are logged.

## Processing limits

All limits are `photo-import.*` properties:

| Property | Default | Safety ceiling |
|---|---|---|
| max-file-size | 5MB (5242880 bytes) | 5 MiB |
| max-width / max-height | 6000 / 6000 | 6000 each |
| max-pixels | 20000000 | 20000000 |
| max-observations | 25 | 100 |
| max-concurrent-analyses | 1 | 4 |
| analysis-timeout | 45s | 60s |

Limits must be positive. The existing multipart limits remain 5MB/file and
6MB/request. Sanitized PNG output also has a hard 64 MiB memory-output bound.
Decoded pixels and codec buffers require substantially more memory than the
compressed upload; keep concurrency at 1 on small development machines.

Capacity is per backend process, covers decoding + sanitation + provider + result
validation, and has no waiting queue. A worker uses Java 21 virtual threads and a
deadline. Timeout interrupts it but **does not release the slot until it actually
exits**; uncooperative codec/provider code cannot cause unbounded replacement jobs.
Java cannot forcibly terminate arbitrary code safely; this is not process-level
sandboxing. There are no automatic retries. Client cancellation discards results
but cannot guarantee immediate server cancellation.

## Angular behavior and limitations

Only the capabilities GET occurs on page entry; selection does not upload images.
An explicit analysis action sends photos sequentially. Each photo has queue,
analysis, success/error/cancelled state and its own associated result. Selection,
rotation and removal are blocked during analysis. Explicit cancellation preserves
successful results, stops the remaining queue, cancels the client subscription and
rejects stale generations. Failed/cancelled photos can be retried individually.
Rotating a completed photo invalidates its previous result.

Simulation is labeled globally and on every result. No metadata resolution,
editable result form, import action or Books/list writes are present. Page reload
loses drafts/results, Object URLs are revoked, and no browser storage is used.
Manual mobile EXIF/capture/accessibility checks remain necessary before release.

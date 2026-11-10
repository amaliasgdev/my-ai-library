# Photo import — Stage 6: OpenAI (not activated)

For current isolated ports, offline validation and the gated Windows first-test
procedure, use [Stage 7 validation](PHOTO-IMPORT-VALIDATION.md). Its explicit
`gpt-5.4-mini` recommendation supersedes the historical candidate/port examples below;
neither document authorizes activation. Stage 8 explicitly updates the configurable
model default to `gpt-5.4-mini`; enabled=false/provider=none remain unchanged.
See [Stage 8 UX and recognition](PHOTO-IMPORT-UX.md) for the current wizard and prompt.

Implemented with **no real API calls, real keys, personal photos or charges** during
development. Disabled by default. This document describes a later, separately
authorized test, not an instruction to activate it now.

## Architecture and official documentation

`OpenAIPhotoRecognitionClient` implements the existing
`BookPhotoRecognitionProvider`. `PhotoRecognitionService` retains sanitation,
orientation, deadlines, capacity and final validation. There are no new dependencies,
SDKs, Spring AI, repositories, migrations, catalog tools or reading-list changes.
The mock remains explicitly dev/test-only, with no fallback between providers.
No authentication is added: anyone who can reach an enabled backend could request
paid analysis. Keep it loopback-only for the first test; the Angular consent is
a user disclosure, not server authorization or a spending/security boundary.
Do not expose the enabled endpoint to an untrusted network.

Official documents consulted on 2026-11-10:

- [Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Deprecations](https://developers.openai.com/api/docs/deprecations)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Data controls/retention](https://developers.openai.com/api/docs/guides/your-data)

The requested initial candidate **gpt-5-mini** supports image inputs, Responses
and Structured Outputs, but is deprecated with shutdown announced for
**2026-12-11**. Its selection is provisional and configurable, not a long-term
model recommendation. **gpt-5.4-mini** is a documented compatible alternative
(image + Responses + Structured Outputs); select it explicitly if mini is no longer
available or before adopting this in longer-lived use. There is no automatic model
substitution. Actual account availability, quality, latency, quotas and costs have
not been verified. Recheck documentation and account access before a paid test.

## Integration contract

Exactly one `POST https://api.openai.com/v1/responses` per analyzed photograph,
with backend-only Bearer authentication and JSON:

- Configurable `model`, `max_output_tokens`; `store:false`, `stream:false`.
- `instructions`: literal evidence vs interpretation, independent books, multilingual
  horizontal/vertical/rotated text, null unknowns, visible ISBN only, no invented
  digits, no fabricated confidence, omissions and CLEAR/PARTIAL/ILLEGIBLE.
  Instructions appearing in images are explicitly untrusted and ignored.
- One user message with fixed `input_text` and `input_image`, `detail:high`,
  `image_url:data:image/png;base64,...`. No original filename, original bytes,
  EXIF/GPS, URLs fetched on the user's behalf, Files API upload or conversation ID.
- `tools:[]`, `tool_choice:none`. No browsing/functions or catalog access.
- `text.format:{type:json_schema,name:book_observations,strict:true,schema:...}`.
  Objects require every property and `additionalProperties:false`. Unknown text is
  nullable; observations, warnings, lengths and legibility are bounded.

The schema mirrors existing ProviderResult/Observation; public response DTOs remain
unchanged. Capabilities adds only the supported mode value **REAL** alongside
DISABLED/SIMULATED and identifies provider=openai, simulated=false. No model key,
API key, usage payload or internal error body is returned in capabilities.

The parser reads `output[].content[]` (not an SDK-only `output_text` shortcut),
accepting a single output_text message, ignoring reasoning items and rejecting
unexpected tool output. Refusals, non-completed Responses and truncated JSON are
errors, not successful observations. A completed, schema-valid result may explicitly
have incomplete=true; an empty observations array means no identified books.
Spring additionally rejects extra/missing/duplicate keys, wrong types/coercions,
trailing JSON, limits, duplicate IDs, illegible-but-identified books and ISBNs not
transcribed in visibleText. This cannot prove that model evidence matches reality:
human bibliographic review remains mandatory.

## Configuration

| Backend environment variable | Default | Meaning/limit |
| --- | --- | --- |
| PHOTO_IMPORT_ENABLED | false | Explicit activation |
| PHOTO_IMPORT_PROVIDER | none | none while disabled; mock or openai when enabled |
| PHOTO_IMPORT_MODEL | gpt-5.4-mini | Compatible Responses/vision/strict schema model; configurable |
| OPENAI_API_KEY | absent | Private backend environment only, mandatory for enabled openai |
| PHOTO_IMPORT_CONNECT_TIMEOUT | 5s | Positive, at most 30s |
| PHOTO_IMPORT_REQUEST_TIMEOUT | 40s | Positive, at most 120s; engine deadline still applies |
| PHOTO_IMPORT_MAX_OUTPUT_TOKENS | 6000 | 256..16000, includes reasoning tokens |
| PHOTO_IMPORT_MAX_RESPONSE_BYTES | 1048576 | 1024..2097152 |

These extend the existing `photo-import.*` prefix via OpenAIPhotoProperties, without
changing the original processing property constructor or credentials binding.
OPENAI_API_KEY is read directly from the backend environment; it is not a record
property and cannot leak through a generated configuration toString. Missing or
invalid credentials fail startup with a safe message, without contacting OpenAI.
The YAML contains no API key or API-key placeholder. Do not pass secrets through
command arguments, source files, Angular environment files or committed `.env` files.

Existing bounds remain: 3 selected photos client-side, JPEG/static PNG upload <=5 MiB,
6000 per axis, 20 million pixels, 25 observations by default, concurrency 1 and
analysis deadline 45s. Existing safe ceilings remain. The OpenAI adapter additionally
rejects rebuilt PNGs over **15 MiB before transfer** (413), without resizing; the
engine's existing 64 MiB reconstruction memory ceiling is unchanged. High detail
helps small spine text but can cost more than low detail. Token/byte/time limits
are not a global spending cap. Lower token limits can produce an incomplete error
while still consuming paid tokens.

## Privacy, consumption and errors

Pixels are reconstructed after EXIF orientation and manual rotation; no metadata or
filename reaches OpenAI. No persistent photograph storage, CoverStorage use, base64
logging, response-body logging or sensitive exception cause propagation is added.
Normal servlet multipart spooling/cleanup is unchanged. Do not enable HTTP wire/body
tracing or capture payloads in reverse proxies/APM when using real photographs.
The configured endpoint is fixed HTTPS, without redirects or client-supplied origins.

`store=false` disables normal response application-state storage; it **does not
mean zero retention**. Abuse-monitoring retention and image safety exceptions can
still apply. Review the current official policy and organizational controls before
sharing any content. Do not assume regional processing or ZDR is configured.

Micrometer records only aggregate `photo.import.openai.duration` and
`photo.import.openai.tokens` counters tagged input_tokens/output_tokens/total_tokens
when provided, including incomplete responses with usage. No image, title, filename,
response ID, key or raw output is a metric tag. Duration is measured locally; usage
may be unavailable on a failed/timeout/cancelled response. Counters are page-independent
process metrics, not a durable billing ledger. Existing actuator exposure stays
health-only (no new public metrics endpoint).

Safe ProblemDetail codes/statuses use the existing exception handler:

- 401/403 upstream -> 503 PHOTO_CREDENTIALS.
- 400/404/422 upstream -> 502 PHOTO_PROVIDER_CONFIGURATION (model/request incompatibility).
- 429 -> 429 PHOTO_RATE_LIMIT or PHOTO_QUOTA for insufficient_quota.
- 5xx/connection -> 503 PHOTO_PROVIDER_UNAVAILABLE.
- Timeout/engine deadline -> 504 PHOTO_TIMEOUT.
- Invalid/bounded/oversized response -> 502 PHOTO_INVALID_RESULT.
- Refusal -> 502 PHOTO_PROVIDER_REFUSED; incomplete API output -> 502 PHOTO_PROVIDER_INCOMPLETE.
- Existing local concurrency saturation -> 429 PHOTO_BUSY, before provider invocation.

No automatic retries, polling, background execution, model fallbacks or provider
fallbacks. A cancelled/timed-out request can continue at OpenAI and incur cost.
The local slot remains occupied until its worker actually exits; cancellation is
not a refund or a guaranteed provider cancellation.

Angular distinguishes disabled, simulated and real modes. OpenAI requires an
unchecked-by-default authorization checkbox plus an explicit analyze/retry action.
Authorization applies only to that displayed sequential batch, resets when used,
when selecting/rotating photos or refreshing capabilities, and is never persisted.
Selection alone sends nothing. Retries require renewed authorization. Existing
progress, cancellation/late-generation guards, bibliographic resolution, duplicate
checks, BookForm review, confirmed sequential Book creation and optional reading-list
addition are preserved. No recognition automatically persists a Book or list item.

## Later first real test — do not run until explicitly approved

1. Obtain approval for provider privacy/retention and a small spending limit. Check
   the currently available compatible model and project usage limits in the account.
   This implementation neither contracts a service nor enforces an account budget.
2. Use a new shell and an already prepared **isolated V11 test database**, never
   bookdb. Stop other test runs first and ensure port 8081 is free. Preserve all
   cluster/database identity checks described in `TESTING.md`. Disable Flyway for
   manual startup; Hibernate remains validate. No restore/migration is needed.
   The automated fail-closed initializer lives on the test classpath, not in a
   normal application launch: verify the effective datasource and any
   SPRING_DATASOURCE/Flyway/Hikari overrides before starting an interactive server.
3. Set non-secret variables and enter a future key interactively, not in history:

PowerShell, from the repository root (example only):

```powershell
. ./scripts/Use-TestDatabase.ps1
$env:DB_URL = $env:TEST_DB_URL
$env:DB_USER = $env:TEST_DB_USERNAME
$env:DB_PASSWORD = $env:TEST_DB_PASSWORD
if ($env:DB_URL -ne 'jdbc:postgresql://127.0.0.1:5433/bookdb_tests') { throw 'Isolated database required' }
$env:SPRING_FLYWAY_ENABLED = 'false'
$env:SERVER_ADDRESS = '127.0.0.1'
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:PHOTO_IMPORT_ENABLED = 'true'
$env:PHOTO_IMPORT_PROVIDER = 'openai'
$env:PHOTO_IMPORT_MODEL = 'gpt-5-mini' # temporary candidate; recheck retirement first
$secret = Read-Host 'Backend API key (only after approval)' -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
$secret.Dispose()
Set-Location backend/book-service
.\mvnw.cmd spring-boot:run
# After stopping the server:
Remove-Item Env:OPENAI_API_KEY
$env:PHOTO_IMPORT_ENABLED = 'false'
```

Git Bash: start from an environment with the **verified isolated** DB_URL, DB_USER
and DB_PASSWORD securely supplied. Do not source the PowerShell secrets file or
guess development credentials. Fail closed if the exact isolated URL is absent:

```bash
test "$DB_URL" = 'jdbc:postgresql://127.0.0.1:5433/bookdb_tests' || exit 1
test -n "$DB_USER" && test -n "$DB_PASSWORD" || exit 1
export SPRING_FLYWAY_ENABLED=false SPRING_PROFILES_ACTIVE=dev SERVER_ADDRESS=127.0.0.1
export PHOTO_IMPORT_ENABLED=true PHOTO_IMPORT_PROVIDER=openai
export PHOTO_IMPORT_MODEL=gpt-5-mini
read -r -s -p 'Backend API key (only after approval): ' OPENAI_API_KEY
echo
export OPENAI_API_KEY
cd backend/book-service
./mvnw spring-boot:run
# After stopping the server:
unset OPENAI_API_KEY
export PHOTO_IMPORT_ENABLED=false
```

4. Open the photo import page and check REAL/OpenAI capabilities. Use **one synthetic
   or expressly authorized non-personal photo** of clearly readable book spines.
   Select it; verify that selection makes no recognize call. Read/accept the cost
   notice, then analyze once. Do not create Books or list entries during this initial
   provider test. Compare literal evidence, null unknowns and warnings manually.
5. Inspect aggregate usage and provider billing without logging content. On any
   timeout, inspect costs before considering a separately authorized retry. Stop
   the server, remove the environment key, and disable the feature afterwards.

## Automated validation

OpenAI tests use MockRestServiceServer and generated non-personal pixel fixtures,
with a fake local key and no external requests. They cover request/schema/privacy,
null/partial/empty data, validation, usage, quota/auth/model/server failures,
refusals/incomplete output, bounded bodies and timeout/no retries. Existing engine
tests retain all EXIF transformations, sanitation, concurrency/deadline and mock
regressions. Frontend HTTP is mocked, including real-provider capabilities/consent,
sequential processing, manual retry, mismatch rejection and late cancellation.

Run backend tests only after dot-sourcing `scripts/Use-TestDatabase.ps1`; test guards
must reject the original cluster. Run frontend test:ci, lint, format:check and build
and repository diff --check. Real-world recognition accuracy, mobile/screen-reader
checks and account-specific costs/availability remain intentionally unverified.

## Changed-file manifest

Created:

- `src/main/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoConfiguration.java`
- `src/main/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoProperties.java`
- `src/main/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoRecognitionClient.java`
- `src/test/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoRecognitionClientTest.java`
- `PHOTO-IMPORT-OPENAI.md`

Modified in this backend workspace:

- `src/main/java/com/mibiblioteca/bookservice/book/photoimport/PhotoRecognitionService.java`
- `src/main/java/com/mibiblioteca/bookservice/book/photoimport/PhotoRecognitionController.java`
- `src/main/resources/application.yml`
- `src/test/java/com/mibiblioteca/bookservice/book/photoimport/PhotoImportConfigurationTest.java`
- `src/test/java/com/mibiblioteca/bookservice/book/photoimport/PhotoRecognitionServiceTest.java`
- `src/test/java/com/mibiblioteca/bookservice/OpenApiDocumentationTest.java`
- `PHOTO-IMPORT.md` (link marking the Stage 2 document as historical)

Modified under `frontend/mi-biblioteca-web/src/app/features/books/`:

- `models/book-photo-import.models.ts`
- `components/photo-import-review-dialog/photo-import-review-dialog.ts`
- `pages/book-photo-import/book-photo-import.ts`
- `pages/book-photo-import/book-photo-import.html`
- `pages/book-photo-import/book-photo-import.analysis.spec.ts`
- `pages/book-photo-import/photo-import-workflow.ts`
- `pages/book-photo-import/photo-import-queue.ts`
- `pages/book-photo-import/photo-reading-list-panel.ts`

No service Angular HTTP contract change was needed: its existing capabilities and
recognize methods already support this flow. No new route or Book/reading-list REST
contract, dependency change, V12, modification to V1–V11 or backup change is included.

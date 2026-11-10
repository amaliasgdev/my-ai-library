# Photo import — Stage 7: offline validation and a gated first real test

Para la prueba manual completa posterior a la etapa 8, con Open Library real y
altas exclusivamente aisladas, usar [Etapa 9](PHOTO-IMPORT-FULL-TEST.md).
Este documento conserva el procedimiento histórico de la primera prueba limitada.

## Status and boundaries (2026-11-10)

Phase B is **NOT authorized by this document**. Do not enter a real key, activate
OpenAI or send photographs until the user separately approves retention/privacy
and spending. No model-account availability check or paid request is part of Phase A.
No changes to production configuration, Book/list REST contracts, dependencies or
V1–V11; no V12. Preserve `backups/`, the original `bookdb` and existing services.

Baseline branch: `feature/book-photo-import`; HEAD `08db30b` (Stage 6). The original
8081 backend and 4200 Angular server are not the validation environment.

## Model recommendation, not an automatic replacement

Official documentation rechecked on 2026-11-10:

- [Deprecations](https://developers.openai.com/api/docs/deprecations):
  `gpt-5-mini` / `gpt-5-mini-2025-08-07` shutdown **2026-12-11**.
- [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini):
  image input, Responses API and Structured Outputs are supported.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs):
  Responses `text.format` with `type:json_schema`, `strict:true`, required properties
  and `additionalProperties:false`. This is the adapter's existing format; backend
  parsing additionally validates types, sizes, keys and ISBN evidence.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data):
  `store:false` is not zero retention or a guarantee of regional processing.

Recommend explicitly selecting **`gpt-5.4-mini`** for the first authorized test:
an economical image-capable mini model, not a claim of measured recognition quality
or of being the cheapest model. Its documented text-token prices are $0.75/M input,
$0.075/M cached input and $4.50/M output. Image input consumes tokens too. Recheck
prices, compatibility and account permissions before execution. The existing default
remains unchanged; there is no automatic model/provider fallback. A strict request's
actual acceptance and recognition accuracy still require the separately authorized test.

## Phase A — offline commands

Run from the repository root in a fresh PowerShell, **without an OpenAI key**:

```powershell
. ./scripts/Use-TestDatabase.ps1
$env:PHOTO_IMPORT_ENABLED = 'false'
$env:PHOTO_IMPORT_PROVIDER = 'none'
Push-Location backend/book-service
try { .\mvnw.cmd clean verify } finally { Pop-Location }
Push-Location frontend/mi-biblioteca-web
try {
    npm run test:ci
    npm run lint
    npm run format:check
    npm run build
} finally { Pop-Location }
git diff --check
```

Check every exit code before proceeding. Tests use simulated OpenAI/Open Library.
The test-classpath initializer checks the exact JDBC URL, database/user, configured
datasource/Flyway/Hikari overrides and isolated cluster identity before writes.
Integration migration tests use only disposable isolated fixtures, never `bookdb`.
Do not run suites and an interactive validation server concurrently.

### Complete application, offline only

After suites finish, backend PowerShell from repository root:

```powershell
./scripts/Start-PhotoImportOffline.ps1
```

It binds `127.0.0.1:8082`, rejects an occupied port or an OpenAI key, forces test/mock,
disables Flyway, keeps Hibernate validation and uses the mandatory isolated-DB guard.
The test-only main class is not packaged in the production JAR. Recognition returns
two clearly marked fixed examples (Dune/Foundation), **not an interpretation of the
selected photograph**. Its primary Open Library transport returns in-memory fixtures
only; unexpected requests never fall through to the network. No remote cover URLs
are returned. Existing fixtures/data are not cleared by starting the application.

Second fresh PowerShell, from `frontend/mi-biblioteca-web`:

```powershell
npm start -- --host 127.0.0.1 --port 4201 --proxy-config proxy.photo-import-isolated.json
```

Use **http://127.0.0.1:4201/books/photo-import** (not 4200). API requests from this
server are proxied only to `http://127.0.0.1:8082`; the normal proxy file is unchanged.
Verify `/api/book-photo-import/capabilities` through port 4201 reports SIMULATED/mock
before testing. Backend health: `http://127.0.0.1:8082/actuator/health`.

Manual acceptance checklist (not replaced by unit tests): select generated/non-personal
JPEG/PNG, rotate, analyze and verify both simulated observations. Search/select
matching fixture editions, review each BookForm and explicitly create only desired
test Books. Reopen a candidate to check duplicate advice. Explicitly select confirmed
identities for reading-list additions and verify their order after browser reload.
Unconfirmed photo drafts disappear on reload; confirmed Books/list entries persist.
Do not infer successful persistence from a local preview or an uncertain response.
Mock mode intentionally has no paid-provider consent requirement; the initially
unchecked consent and renewed consent for real retries are covered with mocked REAL
capabilities in frontend tests, not by activating OpenAI offline.

The added `PhotoImportHttpJourneyTest` exercises real loopback HTTP -> PostgreSQL
commits -> fresh-client reloads with two observations, metadata search/editions/ISBN,
duplicate advice, explicit Book requests, membership and ordered revision-aware list
appends. It removes only its own Book fixtures and restores its list revision baseline
afterwards; isolated sequences may advance. Browser selection, consent and dialogs are
covered separately by frontend tests. This is not a single browser E2E test.

Stop only these two foreground processes with Ctrl+C and close their shells. No
Docker stop/down, database restore or cleanup of unrelated data is necessary.

## Phase B — prepared only; requires separate authorization

1. Agree on privacy/retention, one non-personal photograph and a small monetary
   ceiling. Check the project's available model and billing controls privately.
   Account budget alerts are not necessarily hard caps. The unauthenticated endpoint
   must remain loopback-only; the Angular checkbox is not backend authorization.
2. Stop the offline 8082/4201 servers and all database tests. Do not stop 8081/4200.
   Use a fresh private PowerShell outside OpenCode, with no transcript, debugger,
   session recording, HTTP body/wire logging or environment dumping. Never paste the
   key into a command, chat, `.env`, Angular or a file. `Read-Host -AsSecureString`
   hides input and keeps its **value** out of shell history; the process must still
   hold a plaintext environment credential. OS/process administrators can access it.
3. The following block is **not to be executed until approved**. It deliberately uses
   the test classpath for the isolated DB guard, but the normal application main,
   without importing the offline fixtures. Every safety override is process-local.

```powershell
# ONLY AFTER EXPLICIT AUTHORIZATION; repository root, private PowerShell.
$ErrorActionPreference = 'Stop'
foreach ($port in 8082, 8083) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Required isolated port $port is occupied; no process will be stopped."
    }
}
. ./scripts/Use-TestDatabase.ps1
$env:SERVER_ADDRESS = '127.0.0.1'
$env:SERVER_PORT = '8082'
$env:SPRING_PROFILES_ACTIVE = 'test'
$env:SPRING_FLYWAY_ENABLED = 'false'
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'validate'
$env:STORAGE_COVERS_DIRECTORY = "$PWD/backend/book-service/target/test-covers"
$env:PHOTO_IMPORT_ENABLED = 'true'
$env:PHOTO_IMPORT_PROVIDER = 'openai'
$env:PHOTO_IMPORT_MODEL = 'gpt-5.4-mini' # explicit recommended selection
$env:PHOTO_IMPORT_CONNECT_TIMEOUT = '5s'
$env:PHOTO_IMPORT_REQUEST_TIMEOUT = '40s'
$env:PHOTO_IMPORT_MAX_OUTPUT_TOKENS = '6000'
$env:PHOTO_IMPORT_MAX_RESPONSE_BYTES = '1048576'
# First test is recognition ONLY: prevent accidental real Open Library lookup.
$env:EXTERNAL_BOOKS_OPENLIBRARY_BASEURL = 'http://127.0.0.1:9'
# Optional local usage inspection, only on a separate loopback management port.
$env:MANAGEMENT_SERVER_ADDRESS = '127.0.0.1'
$env:MANAGEMENT_SERVER_PORT = '8083'
$env:MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE = 'health,metrics'
$secret = Read-Host 'Private OpenAI API key (never send to OpenCode)' -AsSecureString
try {
    $env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
    Push-Location backend/book-service
    try {
        .\mvnw.cmd spring-boot:test-run '-Dspring-boot.run.main-class=com.mibiblioteca.bookservice.BookServiceApplication' '-Dspring-boot.run.arguments=--photo-import.max-concurrent-analyses=1'
    } finally { Pop-Location }
} finally {
    $secret.Dispose()
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    $env:PHOTO_IMPORT_ENABLED = 'false'
    $env:PHOTO_IMPORT_PROVIDER = 'none'
}
# Close this shell afterwards, including process-local DB credentials/settings.
```

4. Start Angular with the same explicit 4201/proxy command above. Confirm capabilities
   at `http://127.0.0.1:4201/api/book-photo-import/capabilities` say REAL/openai and
   concurrency 1. Record the explicitly configured model privately; capabilities do
   not expose a model ID. No photograph is sent by loading capabilities or selecting
   a file. Select **one** non-personal photo, verify orientation, read the disclosure,
   check authorization, and analyze **once**. No metadata lookup, Book creation,
   reading-list write or automatic/manual retry is authorized by this first test.
5. Compare results manually with visible titles/authors: correct, incorrect,
   invented, omitted and illegible; note warnings. Do not save the photo, base64,
   a HAR, API bodies or screenshots containing private content. Retain only an
   aggregate checklist/model/duration/token/cost record if desired.
6. From a separate shell, inspect local aggregate metrics without logging payloads:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.duration'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:input_tokens'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:output_tokens'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:total_tokens'
```

   For a fresh process/one request, duration TOTAL_TIME/COUNT gives local seconds;
   use token COUNT values. Conservative uncached estimate in USD at the prices above:
   `(input_tokens * 0.75 + output_tokens * 4.50) / 1000000`. Actual billing, cache,
   image/reasoning consumption and failed requests must be checked in the account.
   Missing usage on an error is **unknown cost**, not zero. Timeouts/cancellation
   can incur charges; never automatically retry. Metrics do not store photo content
   and are not a durable billing ledger. Do not expose port 8083 beyond loopback.
7. Stop only this backend and Angular, allow the finally block to remove the key,
   close both shells and verify 8082/8083/4201 no longer listen. Return to disabled
   defaults unless further work is explicitly authorized. No key is needed by
   OpenCode. The application's default actuator exposure remains health-only.

## Security review / remaining limitations

- Image reconstruction applies EXIF/manual orientation and removes metadata and
  original filenames; no image database/filesystem persistence or cover operation.
  Ordinary servlet temporary multipart buffering remains possible; do not equate
  no persistent storage with never touching temporary disk.
- Defaults: at most 3 selected photos, 5 MiB each, 6000 per axis, 20M pixels, 25
  observations, concurrency 1, engine 45s, provider connect 5s/request 40s, output
  6000 tokens, response 1 MiB, reconstructed PNG transfer 15 MiB. Configuration
  safety ceilings remain as implemented. These are not a total spending cap.
- Fixed HTTPS Responses origin, no redirects, tools, automatic paid retries or
  fallbacks. Prompt treats image text as untrusted, output is strict and validated;
  this mitigates but cannot prove immunity to hallucination/prompt injection.
  Recognition has no persistence tools; human review remains mandatory.
- Adapter has no image/base64/key/body logging. Do not enable payload tracing/APM.
  Repository/history checks for common OpenAI key patterns are not a general
  secret-scanning guarantee; ignored local DB secrets remain ignored.
- Actual account/model access, schema acceptance, recognition accuracy/cost,
  manual browser/mobile/screen-reader checks remain pending. Phase A never proves
  real-provider quality or end-to-end browser behavior with a paid request.

## Executed validation record (2026-11-10)

- `mvnw.cmd -Dtest=PhotoImportHttpJourneyTest test`: 1 test, 0 failures/errors/skips.
- `mvnw.cmd clean verify`: **680 tests, 0 failures, 0 errors, 1 skipped**. The skip
  remains the Windows symbolic-link capability check. Existing MockBean/JVM-agent
  deprecation and Springdoc warnings are non-blocking; no dependency changes made.
- `npm run test:ci`: **1189 passed, 59 files**.
- `npm run lint`, `npm run format:check`, `npm run build`: passed.
- `git diff --check`: passed (Git may print the existing LF/CRLF conversion notice).
- Started the documented offline script, confirmed SIMULATED/mock and in-memory
  metadata fixtures on 8082. Started Angular on 4201, confirmed its `/api` proxy
  reported SIMULATED and `/books/photo-import` returned HTTP 200. This was a startup/
  HTTP smoke check, not an interactive browser acceptance test. Stopped only the
  newly started process trees; 8082/4201 no longer listen. Original 8081/4200 PIDs
  remained unchanged. No database writes were made by these startup smoke requests.
- Checked all 85 existing Git commits for common OpenAI key-token patterns without
  printing candidate secrets: no matches. No tracked backup files/private `.env`
  files; `.env.test-db` is ignored. `backups/` remains untouched and untracked.
- No real credentials, OpenAI calls, external bibliographic calls, personal photo
  transfers, original `bookdb` access, migrations edits or paid activation executed.

Files created in Stage 7:

- `backend/book-service/PHOTO-IMPORT-VALIDATION.md`
- `backend/book-service/src/test/java/com/mibiblioteca/bookservice/book/photoimport/PhotoImportOfflineApplication.java`
- `backend/book-service/src/test/java/com/mibiblioteca/bookservice/book/photoimport/PhotoImportHttpJourneyTest.java`
- `scripts/Start-PhotoImportOffline.ps1`
- `frontend/mi-biblioteca-web/proxy.photo-import-isolated.json`

Modified: `backend/book-service/PHOTO-IMPORT-OPENAI.md` (link to the current procedure).
No branch changes, staging, commits, push, PR or merge. Phase B remains unexecuted.

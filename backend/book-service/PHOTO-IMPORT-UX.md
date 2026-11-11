# Photo import — Stage 8: UX and recognition instructions

## Scope

The user reports successful real tests with two covers and a 13-observation shelf.
Those results motivate this UX/prompt change; they were not repeated during Stage 8.
All automated provider responses are simulated. No API key is read by the agent,
no real OpenAI/Open Library calls, personal images or paid analysis are used here.

## Four-step wizard

`/books/photo-import` now uses the public Angular Material vertical stepper:

1. **Fotografías**: smaller previews, existing camera/file/drop inputs, rotation,
   limits, consent and analyze/retry/cancel controls next to the selected images.
2. **Resultados**: responsive compact cards grouped by photograph, bibliographic
   cover/fallback, title/author, legibility, review status and duplicate advisory.
   Aggregate counts distinguish candidates, pending/reviewed and possible duplicates.
   Original photos and warnings are collapsed by default.
3. **Revisión**: one visible candidate editor with evidence in an expansion panel,
   explicit Open Library search/work/edition/ISBN selection, existing BookForm review
   dialog and catalog duplicate checks. Next-pending navigation never automatically
   confirms an edition, discards a candidate or opens a write confirmation.
4. **Importación**: compact eligible/result rows, explicit selection and the existing
   confirmation/sequential queue. Imported/existing Books enable the optional
   reading-list panel with its unchanged explicit identity/membership/add controls.

The stepper uses eager stable view instances, not lazy views that destroy/recreate
editors. Inactive steps and non-current editors are hidden from keyboard interaction.
Their independent forms, edition choices, requests, corrected drafts, selection and
operation states survive navigation. Changing steps does not analyze/search/review,
import or append to a reading list. Recognition completion advances to Results.
Global operation notices let users return to progress/cancellation controls.

Workflow services remain page-scoped. The original uncertainty, preflight duplicate
checks, revision chaining, stop-after-active and navigation-loss guards are retained.
Reopening final review preserves BookForm corrections instead of replacing them with
an older visual proposal. Removing a photograph retains workflow history as before;
such candidates remain in the separate manual/removed-source group.

## Batch duplicate advisory

Title AND author must both be nonblank and equal after case/whitespace normalization.
No fuzzy/accent repair, image-region guessing or automatic deduplication. All matching
candidates are marked; the count is the number of marked candidates, not duplicate
pairs. Missing fields do not establish a match. Discarded candidates are excluded
from the advisory. Human users may inspect the evidence and explicitly discard a
candidate; identical titles/authors can be distinct physical copies.

This local advisory is separate from catalog duplicate checks and never changes
selection, readiness, confirmed requests or database contents by itself.

## OpenAI instructions and configuration

The existing Responses/Structured Outputs schema, DTOs and REST contracts are
unchanged. The prompt additionally requests:

- Spanish warnings, with literal evidence kept in its original language.
- Separate physical spines/covers and do not borrow text from neighbouring books.
- Separate title and author, without joining adjacent text into an invented name.
- Do not complete hidden/cropped text from memory; explicitly flag incomplete fields.
- Do not emit the same physical region twice, but retain separately visible copies
  with identical metadata and report uncertainty instead of merging them.

The configurable default model is explicitly aligned to **gpt-5.4-mini** in YAML and
property defaults. `PHOTO_IMPORT_MODEL` can still override it. `enabled=false` and
`provider=none` remain the defaults; no key, provider activation, fallback, retry,
additional request or change to image sanitation/limits is introduced.

Prompt wording mitigates but cannot guarantee correct segmentation, Spanish-only
warnings or immunity to hallucination/injection. Backend shape/evidence validation
does not prove the inferred title matches the photograph. Human review is essential.

## Validation and limitations

New offline tests exercise step navigation without repeated requests, stable editors
and in-flight bibliographic reads, independent drafts, incomplete/unknown results,
batch advisory without merging, explicit discard/next-pending navigation, keyboard
step activation, cancelled/uncertain state preservation and corrected selections.
Existing workflow tests retain import confirmation, partial results, uncertain writes,
reading-list sequencing and scanner/ISBN/catalog regressions. Backend mocked tests
assert the instructions and retain two observations with identical title/author.

Responsive CSS uses native grids, wrapping actions and a vertical stepper without
fixed desktop widths. No competing UI framework or dependency has been added.
Physical mobile/screen-reader/browser checks and actual recognition improvements
are not proven by jsdom or prompt assertions and remain manual follow-up work.
Do not perform paid comparisons automatically after this stage.

Backend validation executed against the guarded isolated PostgreSQL only:

```powershell
. ../../scripts/Use-TestDatabase.ps1
$env:PHOTO_IMPORT_ENABLED = 'false'
$env:PHOTO_IMPORT_PROVIDER = 'none'
.\mvnw.cmd clean test '-Dspring.test.context.cache.maxSize=4'
```

**682 tests, 0 failures, 0 errors, 1 skipped** (Windows symbolic-link capability).
An initial `clean test` without the cache bound had 4 connection-capacity errors
while the user's existing isolated server was also running. Bounding the test
context cache releases idle pools; no database setting or existing service was
modified/stopped. Existing deprecation/Springdoc warnings remain non-blocking.

Final frontend validation:

- `npm run test:ci`: **1198 passed across 60 files**.
- Wizard subset rerun: **8 passed**, including bibliographic cover-error fallback.
- `npm run lint`, `npm run format:check`, `npm run build`: all passed.
- `git diff --check`: passed (only the existing LF/CRLF conversion notices).

The page integration test now covers explicit final review -> explicit Book import
confirmation -> confirmed ID -> membership consultation -> independent reading-list
confirmation -> revision-aware append. Browsing steps during the append does not
cancel it or repeat a POST. A separate regression verifies reopening review preserves
manual corrections but still resets the review acknowledgement/selection as required.

## Changed-file inventory

Created:

- `backend/book-service/PHOTO-IMPORT-UX.md`
- `frontend/mi-biblioteca-web/src/app/features/books/pages/book-photo-import/photo-candidate-card.ts`
- `frontend/mi-biblioteca-web/src/app/features/books/pages/book-photo-import/book-photo-import.wizard.spec.ts`

Modified backend files:

- `backend/book-service/PHOTO-IMPORT-OPENAI.md`
- `backend/book-service/src/main/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoRecognitionClient.java`
- `backend/book-service/src/main/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoProperties.java`
- `backend/book-service/src/main/resources/application.yml`
- `backend/book-service/src/test/java/com/mibiblioteca/bookservice/book/photoimport/OpenAIPhotoRecognitionClientTest.java`

Modified under `frontend/mi-biblioteca-web/src/app/features/books/pages/book-photo-import/`:

- `book-photo-import.ts`, `book-photo-import.html`, `book-photo-import.scss`
- `photo-import-queue.ts`
- `book-photo-import.analysis.spec.ts`, `book-photo-import.workflow.spec.ts`

No workflow service, BookForm, metadata component, CRUD/list contract, migration,
dependency, backup or credential file is modified. No commits, staging or push.

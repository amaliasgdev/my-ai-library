# Photo import — manual candidates, optional genre and next-phase audit

Scope: candidate intake only. No migration, no contract change, no dependency, no
provider call. `bookdb`, V1–V11 and backups are untouched. Tests use the isolated
PostgreSQL on 5433 and offline fixtures.

## 1. Demonstrated cause of the "genre required" report

The report is **not reproduced by any layer**:

| Layer | Finding |
| --- | --- |
| Angular `BookForm` | `genres` is a `FormArray` whose only validator (`genreList`) rejects more than 10 and duplicates; an empty list is valid. Only title and author carry `required`. The pending "Nuevo género" input is optional and is added only if the user typed text. |
| Review dialog | Only the "He contrastado…" checkbox gates *Confirmar revisión*. |
| `BookRequest` | `genres` is optional (`null`/omitted/`[]`); elements must be nonblank, ≤50 characters. |
| Entity / DB | `genres VARCHAR(50)[] NOT NULL DEFAULT '{}'`; CHECK only limits cardinality ≤10 and forbids NULL elements. An empty array satisfies it. |

What the old *Añadir manualmente un libro omitido* did: `addManual()` created an empty
row and immediately opened the generic `BookForm` review dialog. That form is a
persistence form, so it showed the whole schema (including *Géneros*) with an empty
title/author, and offered **no bibliographic search**. The perceived requirement most
likely came from that wall of empty fields plus the mandatory title/author. Nothing
was changed in validation because nothing required a genre; no placeholder such as
"Sin género" exists or was introduced.

Regression coverage proves the optionality: `BookWithoutGenresIntegrationTest`
(real HTTP/MockMvc against isolated PostgreSQL: omitted, `null` and `[]` genres, null
ISBN, stored as `'{}'`), the review-dialog and workflow specs (confirmed request with
`genres: []` and `isbn: null` is POSTed unchanged), and a negative test that a blank
genre is still rejected.

## 2. New behaviour

`PhotoImportWorkflow.addManual()` opens `ManualCandidateDialog` (Material, typed
reactive form, no HTTP): Título, Autor (both required, ≤255, single line), ISBN
optional (≤50, no control characters). Actions:

- **Añadir y buscar coincidencias** (also native form submit/Enter).
- **Añadir sin buscar**.
- **Cancelar**/Escape/backdrop: returns nothing, creates nothing.

An accepted result calls `addManualCandidate()`, which only adds a page-local row
(`manual:N`, source *Añadido manualmente*, draft with empty genres, state `pending`)
and a synthetic observation (no photograph, no `visibleText`). It never creates a Book,
never calls recognition/OpenAI and does not touch photograph candidates.

The row is rendered by the same `PhotoCandidateCard` beside the recognized candidates
(marked *Introducido manualmente · sin fotografía*) and is backed by the same
`PhotoMetadataCandidate` editor, so it reuses, unchanged: ISBN lookup or
title/author search, work and edition choice, ranking/ambiguity rules, duplicate
advisories, explicit review dialog, confirmation, sequential import and the
reading-list panel. It also takes part in *Buscar metadatos de todos los libros*.
Only "Añadir y buscar" triggers one search (after its editor exists and when no batch
is running); "Añadir sin buscar" leaves it pending for the explicit search, the batch
or manual review. Adding from the *Importación* step moves the wizard to *Resultados*.
Reopening review, duplicates, import and reading list keep their previous guarantees.

Limits: manual candidates are lost on reload, like every other draft (existing
beforeunload warning). Removing a photograph never removes manual candidates.

## 3. Audit of the next phases (analysis only, nothing implemented)

| Improvement | Frontend only? | Structural impact |
| --- | --- | --- |
| Five-star rating component | **Yes.** `PUT /rating` 1..5 and `DELETE /rating` already exist; BookCard uses a Material select today. | Replace the select with a reusable accessible radio-group component (keyboard, `aria-label`, clear = *Sin valorar*), keep the same service calls and the confirmed-value restore rule. |
| Light / dark / automatic theme | **Yes.** `html.app-dark` tokens already exist in `_material-theme.scss`; there is no switch. | A small preference service toggling the class (automatic via `matchMedia`), a menu in the shell. Needs a decision on storage (below). |
| Cards per row (auto, 2–6) | **Yes.** The catalog grid is local CSS (`auto-fill/minmax`). | CSS custom property driven by the preference; keep a mobile minimum so 6 columns degrade on narrow screens. |
| Local persistence of visual preferences | **Yes**, but conflicts with a current rule. | AGENTS rules currently forbid storage persistence for catalog state and say the theme has no persistence. A *visual preferences only* `localStorage` key (versioned, validated, fail-safe) needs explicit approval; never filters/search/drafts. |
| Multiple genres per book (already stored) | **Partly.** Multi-valued genres exist (`varchar[]`, ≤10, case-preserving). | The selector UX with search + checkboxes is frontend work in BookForm and the review dialog. |
| Reusable genre catalog and custom genres | **No — structural.** | Needs a source of suggestions. Option A (no migration): derive distinct values from existing books through a *new read-only endpoint* (aggregation over `unnest(genres)`; contract addition, optional index). Option B (new `genre` table + migration + ownership/normalization rules + book↔genre link or constrained array) which AGENTS currently lists as out of scope ("genres as separate entities") and requires explicit authorization and a data migration of free-text values. |
| Genre checkbox filter in the catalog | Frontend for UI; **contract change if multi-select**. | Today `genre` is a single case-insensitive value in the URL/API (`book_genre_matches`). Multi-select needs repeated parameters (OR vs AND decision), backend `BookFilterRequest`/specification and URL helper changes; no index exists on `genres`, so large catalogs would want a GIN index (a migration). |

### Proposed order

1. **Frontend-only, low risk:** reusable `StarRating` (BookCard, detail, review), then
   grid-density control (pure CSS variable).
2. **Frontend + approval for preference storage:** theme switch and persisted visual
   preferences (one `ThemePreferences` service, schema-validated `localStorage`,
   no OS side effects beyond `matchMedia`).
3. **Genre selector (frontend):** searchable multi-select with chips over the existing
   `genres` array; suggestions initially from the current form/page only.
4. **Needs decisions/authorization:** read-only distinct-genres endpoint (preferred,
   no schema change) → optional GIN index migration → only then a real genre catalog;
   multi-select catalog filter after the AND/OR semantics are chosen.

Every phase should keep: no new UI library, Material only, strict TypeScript, offline
tests, and the existing BookRequest/BookResponse contracts unless listed above.

## 4. Files

Created: `manual-candidate-dialog.ts` and its spec,
`BookWithoutGenresIntegrationTest.java`, this document.

Modified: `photo-import-workflow.ts` (+spec), `book-photo-import.ts/.html`
(+`wizard.spec.ts`), `photo-candidate-card.ts`, `photo-metadata-candidate.ts/.html`,
`photo-import-review-dialog.spec.ts`.

# Photo import — Stage 4

This stage is frontend-only. Recognition remains simulated. Each recognized
observation starts as an unselected, unreviewed candidate associated with its
photo ID and filename. A missed book can be added manually even when recognition
is disabled. No photo bytes or object URLs are ever sent as cover URLs.

## Review and selection

The bibliographic candidate can send its chosen edition/ISBN or manual draft to
the final review. `PhotoImportReviewDialog` reuses `BookForm` with editable,
optional ISBN, no scanner or lookup, and an explicit checkbox confirming the
actual book's data rather than the simulated example. `buildBookRequest()` is
still the only form request builder. The shared `createBookForm()` factory keeps
editor and preflight validation identical; existing ISBN import is unchanged.

Confirming review performs no POST. The row first enters reviewed/checking state.
The page-scoped `PhotoImportWorkflow` checks ISBN equivalents and possible
title/author matches using metadata-duplicates, plus the existing exact ISBN
catalog search (including CRUD-valid ISBNs with an invalid lookup checksum).
Unknown/incomplete checks block selection. Exact/equivalent ISBN matches become
existing, never ready. Possible matches require a separate explicit decision;
their identity/details and truncation state are retained as an approval signature.
Ready rows remain unselected until individual or select-all action.

Every new revision clears confirmation, duplicate approval and selection, cancels
old GETs, and increments a revision token. Opening a new final review invalidates
the previous authorization even if the dialog is cancelled. Editing an imported,
discarded or uncertain row cannot silently recreate or resurrect it. To correct
an uncertain candidate, first reconcile and explicitly authorize a risky retry.

## Writes and partial results

Import selected shows a summary and explicit confirmation. Selection/revisions
are frozen while running. Each row is validated again and duplicates are checked
again immediately before its POST to the existing `/api/books`. If new possible
matches appear, that row requires a new approval rather than being posted.
Writes run sequentially without a global transaction or automatic retries.
Confirmed IDs are retained and exposed as detail links. Stop prevents new writes
but waits for the active GET/POST; a stopped preflight never starts a POST.

A 400 needs a new review. A 409 consults the catalog without another POST. Network,
timeout, other ambiguous errors and malformed success confirmations become
uncertain and trigger a read-only reconciliation. An existing ISBN prevents a
second creation but does not prove that our previous request created the book.
Otherwise uncertainty remains, especially without ISBN. A successful catalog
consultation plus a separate risk confirmation only permits a new review;
the user must confirm, select, and approve import again. A failed reconciliation
does not grant retry permission.

The page summarizes imported, existing, discarded, error and uncertain rows.
Removing a local photo frees its object URL but intentionally retains candidate
history and confirmed IDs. Additional photos can be selected after removing old
ones; photo IDs are never reused within the page. Discarding a candidate cancels
its checks and invalidates late responses. Imported and uncertain rows cannot be
discarded, to avoid hiding committed or possibly committed operations.

## Navigation and limits

The photo route alone has a Material confirmation guard for reviewed pending
work, errors and uncertainty. Navigation is blocked during an active write or
dialog. Browser reload/close uses the native beforeunload warning, whose wording
and presentation depend on the browser and prior user interaction. The guard
does not apply to the existing ISBN import route. Nothing is persisted in browser
storage; photographs, drafts and uncertain outcomes are lost on reload/exit.
Cancellation/destruction cannot roll back a server commit.

There is no server idempotency key, global transaction or unique ISBN-less book
identity. Duplicate checks are advisory and can race with another client; the
existing backend ISBN unique constraint remains authoritative. Without ISBN,
even an explicit retry can create a duplicate. Manual mobile/accessibility checks
are still needed. No backend changes, migrations, recognition provider or
reading-list additions are part of this stage. Automated frontend tests mock all
HTTP, including POSTs; they do not write to any PostgreSQL database.

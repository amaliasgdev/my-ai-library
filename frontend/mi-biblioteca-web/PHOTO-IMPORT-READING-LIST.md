# Photo import — Stage 5: optional reading-list additions

Frontend only. No REST/backend changes, database access, migrations, AI provider,
credentials or persistence of drafts/photos. Recognition remains simulated.
Book creation and reading-list addition are independent explicit operations.

## Eligibility and membership

`PhotoReadingListWorkflow` is page-scoped and receives catalog candidates from
`PhotoImportWorkflow`. It accepts only imported Books with confirmed positive
safe-integer IDs, or exact/equivalent existing Books whose identity the user has
explicitly confirmed. Unimported, discarded, ambiguous and uncertain creations
are excluded. Revisions/identity changes invalidate existing-book confirmation.
Repeated Book IDs appear once, even if several candidates refer to them.

The new section initially selects nothing. **Consultar pertenencia por lote**
queries confirmed IDs using the unchanged ReadingListService.membership(),
with sequential batches of at most 100 IDs, never one GET per candidate. It is
explicit so sequential Book creation does not trigger an HTTP request per success.
Unknown/failed/incomplete membership is not absence and cannot be selected.
Session-confirmed added/included IDs cannot be written again from this page,
including when source candidates disappear and later reappear.

## Ordered writes

Individual selection establishes sequence order. Select-all appends the remaining
eligible IDs in display order; deselect/reselect moves an ID to the end. The
confirmation lists this exact order. Before writing, getList() obtains the latest
unfiltered list and revision and skips Books already present in that snapshot.
Each add() appends using only bookId and expectedRevision. Revisions stay canonical
decimal strings; BigInt validates progression without Number precision loss.
Each confirmed add supplies the revision for the next request. No parallel writes,
global transaction, status/date changes, Book deletion or automatic POST retry.

ReadingListService and its response models are reused unchanged. Existing
ReadingListMembership/ReadingListAction are intentionally not used to drive the
sequence: they expose a single-book action and privately manage revisions followed
by refresh, not a confirmed revision chain. Existing catalog/detail actions remain
unchanged. The feature reuses the existing photo confirmation dialog.

Stop waits for the active request and prevents all subsequent writes, including
when pressed during the initial revision read. Catalog creation/editing and list
writes/dialogs are mutually exclusive on this page. The photo route guard blocks
navigation during list writes/dialogs; browser close/reload uses beforeunload.
Pending list selections and uncertainty also participate in the leave warning.

## Conflict and uncertainty

Any failed/ambiguous addition pauses the sequence; the remaining selected Books
stay pending. A 409 triggers membership plus getList(), distinguishing currently
included from absent with a revision conflict. It never repeats the failed POST.
Network/5xx/timeouts or invalid success confirmations remain uncertain unless a
read confirms current inclusion. A read-confirmed inclusion is shown as already
included, not falsely attributed to our earlier request.

Absent reconciliation requires consistent membership/list revisions before
enabling retry preparation. Preparing retry is a separate explicit confirmation,
with an additional uncertain-outcome warning, and only makes the entry available
and unselected. Selection, sequence confirmation and a fresh revision GET are
still required. An absent read does not prove that a timed-out request failed;
it could finish later. Subsequent membership failures cannot erase uncertainty
or silently enable another write. All successfully created Books/IDs remain in
the catalog workflow regardless of list results.

## Limits and validation

This is process/page-local orchestration, not a server transaction or idempotency
scheme. Another client may change the list between reads/writes; existing revision
conflicts are the authority. Browser cancellation cannot undo server commits.
Reload/exit loses page-local queue state and uncertainty (after the warning).
Session-confirmed included IDs are not offered again even if another client later
removes them; reload the normal reading-list page to inspect current membership.
The existing GET list contract returns the full list; no new pagination is added.

All automated frontend HTTP requests, including POSTs, are simulated. Tests cover
membership batches, eligibility/identity, selection/order, large decimal revisions,
409, ambiguity, stop, partial results, preserved Books, navigation and regressions.
Manual mobile/screen-reader checks remain pending; no real writes or recognition
provider calls are made during tests.

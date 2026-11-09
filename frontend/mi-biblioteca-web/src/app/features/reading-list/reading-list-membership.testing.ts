import { HttpTestingController } from '@angular/common/http/testing';

/** Complete the independent, read-only membership sidecar in pre-existing
 * catalog/detail regression tests. Feature tests assert these requests explicitly.
 * Does not consume writes or any catalog/Book request. */
export function completeMembershipQueries(http: HttpTestingController): void {
  for (const request of http.match(
    (req) => req.method === 'GET' && req.url === '/api/reading-list/membership',
  )) {
    if (!request.cancelled)
      request.flush({
        revision: '0',
        items: request.request.params
          .getAll('bookId')!
          .map((id) => ({ bookId: Number(id), included: false, entryId: null })),
      });
  }
}

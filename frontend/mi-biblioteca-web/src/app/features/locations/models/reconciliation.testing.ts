import {
  ReconciliationDetail,
  ReconciliationGroup,
  ReconciliationPage,
} from './reconciliation.models';

/** Offline fixtures only; never used by production components. */
export function testReconciliationGroup(
  overrides: Partial<ReconciliationGroup> = {},
): ReconciliationGroup {
  return {
    groupKey: 'opaque-key',
    room: 'Salón',
    bookcase: 'Billy izquierda',
    shelf: 'Superior',
    variantCount: 2,
    bookCount: 2,
    type: 'COMPLETE',
    match: 'EXACT',
    destinationSuggestion: {
      roomId: 1,
      roomName: 'Salón',
      bookcaseId: 2,
      bookcaseName: 'Billy izquierda',
      shelfId: 3,
      shelfName: 'Superior',
    },
    ...overrides,
  };
}
export function testReconciliationPage(
  overrides: Partial<ReconciliationPage> = {},
): ReconciliationPage {
  return {
    content: [testReconciliationGroup()],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    statistics: { pendingGroups: 1, pendingBooks: 2, completeGroups: 1, partialGroups: 0 },
    ...overrides,
  };
}
export function testReconciliationDetail(
  overrides: Partial<ReconciliationDetail> = {},
): ReconciliationDetail {
  return {
    group: testReconciliationGroup(),
    variants: [
      { room: 'Salón', bookcase: 'Billy izquierda', shelf: 'Superior', bookCount: 1 },
      { room: 'salón', bookcase: 'Billy izquierda', shelf: 'Superior', bookCount: 1 },
    ],
    content: [
      {
        id: 7,
        title: 'Dune',
        author: 'Frank Herbert',
        isbn: '9780306406157',
        room: 'Salón',
        bookcase: 'Billy izquierda',
        shelf: 'Superior',
      },
    ],
    page: 0,
    size: 20,
    totalElements: 2,
    totalPages: 1,
    reviewToken: 'opaque.signed',
    snapshotFingerprint: 'snapshot-one',
    reviewedCount: 2,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    ...overrides,
  };
}

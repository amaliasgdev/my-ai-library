import {
  InventorySessionResponse,
  ShelfInventorySessionsResponse,
} from './inventory-session.models';

export function testInventorySession(
  overrides: Partial<InventorySessionResponse> = {},
): InventorySessionResponse {
  return {
    id: 7,
    shelf: {
      roomId: 1,
      roomName: 'Salón',
      bookcaseId: 2,
      bookcaseName: 'Billy',
      shelfId: 3,
      shelfName: 'Superior',
    },
    status: 'IN_PROGRESS',
    notes: 'Notas originales',
    createdAt: '2026-10-15T08:00:00Z',
    updatedAt: '2026-10-15T08:00:00Z',
    startedAt: '2026-10-15T08:00:00Z',
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}
export function testInventoryHistory(
  overrides: Partial<ShelfInventorySessionsResponse> = {},
): ShelfInventorySessionsResponse {
  const session = testInventorySession();
  return {
    shelf: session.shelf,
    activeSession: session,
    content: [session],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    ...overrides,
  };
}

export type InventorySessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface InventoryShelfContext {
  roomId: number;
  roomName: string;
  bookcaseId: number;
  bookcaseName: string;
  shelfId: number;
  shelfName: string;
}
export interface InventorySessionSummary {
  id: number;
  status: InventorySessionStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}
export interface InventorySessionResponse extends InventorySessionSummary {
  shelf: InventoryShelfContext;
}
export interface ShelfInventorySessionsResponse {
  shelf: InventoryShelfContext;
  activeSession: InventorySessionSummary | null;
  content: InventorySessionSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export const INVENTORY_STATUS_LABELS: Record<InventorySessionStatus, string> = {
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
};
export function inventoryId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function inventoryPaging(params: { get(name: string): string | null }) {
  const raw = params.get('page') ?? '0';
  const page = /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : 0;
  const size = Number(params.get('size') ?? 20);
  return { page, size: [10, 20, 50, 100].includes(size) ? size : 20 };
}

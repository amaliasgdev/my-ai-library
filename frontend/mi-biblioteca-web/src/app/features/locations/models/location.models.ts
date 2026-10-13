export type LocationLevel = 'rooms' | 'bookcases' | 'shelves';
export interface LocationItem {
  id: number;
  name: string;
}
export interface ShelfNode extends LocationItem {
  bookCount: number;
  canDelete: boolean;
  blockedReason: string | null;
}
export interface BookcaseNode extends ShelfNode {
  shelves: ShelfNode[];
}
export interface RoomNode extends ShelfNode {
  bookcases: BookcaseNode[];
}
export interface LocationCreation {
  level: LocationLevel;
  parentId?: number;
}
export interface LocationSelection {
  shelfId: number | null;
  incomplete: boolean;
  clearLegacy: boolean;
}

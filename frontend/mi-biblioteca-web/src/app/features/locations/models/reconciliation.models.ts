export type ReconciliationType = 'ALL' | 'COMPLETE' | 'PARTIAL';
export interface LegacyLabels {
  room: string | null;
  bookcase: string | null;
  shelf: string | null;
}
export interface ReconciliationDestination {
  roomId: number;
  roomName: string;
  bookcaseId: number;
  bookcaseName: string;
  shelfId: number;
  shelfName: string;
}
export interface ReconciliationGroup extends LegacyLabels {
  groupKey: string;
  variantCount: number;
  bookCount: number;
  type: 'COMPLETE' | 'PARTIAL';
  match: 'EXACT' | 'NONE' | 'AMBIGUOUS' | 'NOT_APPLICABLE';
  destinationSuggestion: ReconciliationDestination | null;
}
export interface ReconciliationStatistics {
  pendingGroups: number;
  pendingBooks: number;
  completeGroups: number;
  partialGroups: number;
}
export interface ReconciliationPage {
  content: ReconciliationGroup[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  statistics: ReconciliationStatistics;
}
export interface ReconciliationBook extends LegacyLabels {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
}
export interface ReconciliationVariant extends LegacyLabels {
  bookCount: number;
}
export interface ReconciliationDetail {
  group: ReconciliationGroup;
  variants: ReconciliationVariant[];
  content: ReconciliationBook[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  reviewToken: string;
  snapshotFingerprint: string;
  reviewedCount: number;
  expiresAt: string;
}
export interface ReconciliationAssign {
  reviewToken: string;
  shelfId: number;
  expectedDestination: { room: string; bookcase: string; shelf: string };
}
export interface ReconciliationAssigned {
  affectedCount: number;
  shelfId: number;
}

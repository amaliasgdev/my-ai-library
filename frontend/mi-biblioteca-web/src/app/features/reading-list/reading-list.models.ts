import { BookResponse } from '../books/models/book.models';

export interface ReadingListItem {
  entryId: number;
  position: number;
  addedAt: string;
  book: BookResponse;
}

export interface ReadingListResponse {
  revision: string;
  totalItems: number;
  items: ReadingListItem[];
}

export interface ReadingListMoveResponse {
  revision: string;
  entryId: number;
  position: number;
}

export interface ReadingListMembershipResponse {
  revision: string;
  items: { bookId: number; included: boolean; entryId: number | null }[];
}

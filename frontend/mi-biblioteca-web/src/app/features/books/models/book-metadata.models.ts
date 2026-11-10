import { BookLookupResponse } from './book.models';

export interface MetadataWork {
  workKey: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  firstPublicationYear: number | null;
  editionCount: number | null;
  matchKind?: 'EXACT_TEXT' | 'APPROXIMATE' | 'UNASSESSED';
}
export interface MetadataEditionFilters {
  language?: string;
  title?: string;
  publisher?: string;
  year?: string;
  isbn?: string;
}
export interface MetadataWorks {
  content: MetadataWork[];
  truncated: boolean;
}
export type EditionMetadata = Omit<BookLookupResponse, 'isbn'> & { isbn: string | null };
export interface MetadataEdition {
  editionKey: string;
  isbns: string[];
  metadata: EditionMetadata;
}
export interface MetadataEditions {
  workKey: string;
  page: number;
  content: MetadataEdition[];
  hasNext: boolean;
  partial?: boolean;
}
export interface MetadataDuplicates {
  originalIsbn: string | null;
  normalizedIsbn: string | null;
  validIsbn: boolean;
  equivalentIsbns: string[];
  matches: {
    id: number;
    title: string;
    author: string;
    isbn: string | null;
    kind: 'EXACT_ISBN' | 'EQUIVALENT_ISBN' | 'POSSIBLE_TITLE_AUTHOR';
  }[];
  truncated: boolean;
  similarityChecked: boolean;
}

/** Lookup-only checksum; deliberately independent from scanner and permissive CRUD validators. */
export function normalizedMetadataIsbn(raw: string): string | null {
  const value = raw.replaceAll('-', '').replaceAll(' ', '').trim().toUpperCase();
  if (/^[0-9]{9}[0-9X]$/.test(value)) {
    const sum = [...value].reduce(
      (sum, digit, i) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - i),
      0,
    );
    return sum % 11 === 0 ? value : null;
  }
  if (/^97[89][0-9]{10}$/.test(value)) {
    const sum = [...value].reduce(
      (sum, digit, i) => sum + Number(digit) * (i % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0 ? value : null;
  }
  return null;
}

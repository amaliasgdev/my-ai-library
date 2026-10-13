import { BookFormValue } from '../components/book-form/book-form.helpers';
import { BookLookupResponse, BookRequest } from './book.models';
import { normalizeManualIsbnImport } from './manual-isbn-import';

export interface IsbnImportEntry {
  id: number;
  text: string;
  isbn: string | null;
  ambiguous: boolean;
  occurrences: number;
}

export interface IsbnImportRow extends IsbnImportEntry {
  existence: 'pending' | 'new' | 'existing' | 'error';
  metadata: 'pending' | 'found' | 'notFound' | 'error';
  creation: 'notReady' | 'ready' | 'creating' | 'created' | 'error' | 'uncertain';
  draft: BookFormValue;
  request: BookRequest | null;
  selected: boolean;
  bookId: number | null;
  message: string | null;
  conflict: boolean;
}

export interface IsbnImportParseResult {
  entries: IsbnImportEntry[];
  error: string | null;
}

export function parseBulkIsbnImport(text: string): IsbnImportParseResult {
  if (text.length > 10_000)
    return { entries: [], error: 'Máximo 10.000 caracteres; no se ha procesado el texto' };
  const candidates: { text: string; ambiguous: boolean }[] = [];
  for (const raw of text.split(/[\r\n,;]/)) {
    const segment = raw.replace(/^ +| +$/g, '');
    if (!segment) continue;
    const compact = segment.replace(/[ -]/g, '');
    const tokens = segment.split(/ +/);
    if (/^[0-9 -]+$/.test(segment) && compact.length === 13) {
      candidates.push({ text: segment, ambiguous: false });
    } else if (
      tokens.length > 1 &&
      tokens.every((token) => /^[0-9-]+$/.test(token) && token.replace(/-/g, '').length === 13)
    ) {
      for (const token of tokens) candidates.push({ text: token, ambiguous: false });
    } else {
      candidates.push({ text: segment, ambiguous: tokens.length > 1 });
    }
  }
  if (candidates.length > 100)
    return { entries: [], error: 'Máximo 100 entradas; no se ha procesado el lote' };
  if (!candidates.length) return { entries: [], error: 'Introduce al menos un ISBN' };
  const entries: IsbnImportEntry[] = [];
  const seen = new Map<string, IsbnImportEntry>();
  for (const candidate of candidates) {
    const isbn = candidate.ambiguous ? null : normalizeManualIsbnImport(candidate.text);
    const previous = isbn ? seen.get(isbn) : undefined;
    if (previous) {
      previous.occurrences++;
      continue;
    }
    const entry = { id: entries.length, ...candidate, isbn, occurrences: 1 };
    entries.push(entry);
    if (isbn) seen.set(isbn, entry);
  }
  return {
    entries,
    error: seen.size > 25 ? 'Máximo 25 ISBN válidos únicos; no se consultará ningún libro' : null,
  };
}

export function importDraft(isbn: string, proposal?: BookLookupResponse): BookFormValue {
  return {
    isbn,
    title: proposal?.title ?? '',
    author: proposal?.author ?? '',
    description: '',
    publisher: proposal?.publisher ?? '',
    publicationYear: proposal?.publicationYear ?? null,
    pageCount: proposal?.pageCount ?? null,
    language: proposal?.language ?? '',
    genres: [...(proposal?.genres ?? [])],
    coverUrl: proposal?.coverUrl ?? '',
    room: '',
    bookcase: '',
    shelf: '',
  };
}

export function importRow(entry: IsbnImportEntry): IsbnImportRow {
  return {
    ...entry,
    existence: 'pending',
    metadata: 'pending',
    creation: 'notReady',
    draft: importDraft(entry.isbn ?? ''),
    request: null,
    selected: false,
    bookId: null,
    message: null,
    conflict: false,
  };
}

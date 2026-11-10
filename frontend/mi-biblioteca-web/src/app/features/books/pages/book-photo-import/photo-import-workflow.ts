import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription, forkJoin, of, take, map, finalize } from 'rxjs';
import { BookFormValue } from '../../components/book-form/book-form.helpers';
import { validConfirmedBookRequest } from '../../components/book-form/book-form.factory';
import { PhotoImportReviewDialog } from '../../components/photo-import-review-dialog/photo-import-review-dialog';
import {
  PhotoImportConfirmDialog,
  PhotoImportConfirmation,
} from '../../components/photo-import-confirm-dialog/photo-import-confirm-dialog';
import { BookRequest } from '../../models/book.models';
import { MetadataDuplicates } from '../../models/book-metadata.models';
import { BooksService } from '../../services/books.service';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';

export type PhotoCandidateState =
  | 'pending'
  | 'reviewed'
  | 'possible'
  | 'existing'
  | 'ready'
  | 'importing'
  | 'imported'
  | 'error'
  | 'uncertain'
  | 'discarded';
export interface PhotoImportCandidate {
  id: string;
  source: string;
  draft: BookFormValue;
  request: BookRequest | null;
  state: PhotoCandidateState;
  selected: boolean;
  revision: number;
  duplicates: MetadataDuplicates | null;
  approvedMatches: string | null;
  bookId: number | null;
  message: string | null;
}
export const emptyPhotoDraft = (): BookFormValue => ({
  title: '',
  author: '',
  isbn: '',
  description: '',
  coverUrl: '',
  publisher: '',
  publicationYear: null,
  pageCount: null,
  language: '',
  genres: [],
});
const requestDraft = (r: BookRequest): BookFormValue => ({
  ...r,
  isbn: r.isbn ?? '',
  description: r.description ?? '',
  coverUrl: r.coverUrl ?? '',
  publisher: r.publisher ?? '',
  language: r.language ?? '',
  genres: [...r.genres],
});

/** Page-scoped orchestration. Only confirmed requests may enter the sequential POST queue. */
@Injectable()
export class PhotoImportWorkflow {
  private readonly reading = inject(PhotoReadingListWorkflow);
  private readonly books = inject(BooksService);
  private readonly dialogs = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  private readonly reads = new Map<string, Subscription>();
  private write: Subscription | null = null;
  private dialogRef: MatDialogRef<unknown> | null = null;
  private generation = 0;
  private manualId = 0;
  readonly rows = signal<PhotoImportCandidate[]>([]);
  readonly simulated = signal(true);
  readonly creating = signal(false);
  readonly stopped = signal(false);
  readonly dialogOpen = signal(false);
  readonly completed = signal(0);
  readonly total = signal(0);
  readonly selectedCount = computed(
    () => this.rows().filter((r) => r.selected && r.state === 'ready').length,
  );
  readonly pendingWork = computed(() =>
    this.rows().some((r) =>
      ['reviewed', 'possible', 'ready', 'importing', 'error', 'uncertain'].includes(r.state),
    ),
  );
  readonly locked = computed(() => this.creating() || this.dialogOpen() || this.reading.locked());
  readonly summary = computed(() => ({
    imported: this.rows().filter((r) => r.state === 'imported').length,
    existing: this.rows().filter((r) => r.state === 'existing').length,
    discarded: this.rows().filter((r) => r.state === 'discarded').length,
    errors: this.rows().filter((r) => r.state === 'error').length,
    uncertain: this.rows().filter((r) => r.state === 'uncertain').length,
  }));

  constructor() {
    this.destroy.onDestroy(() => {
      this.generation++;
      this.reads.forEach((s) => s.unsubscribe());
      this.write?.unsubscribe();
      this.dialogRef?.close();
    });
  }

  private row(id: string) {
    return this.rows().find((r) => r.id === id);
  }
  private update(id: string, patch: Partial<PhotoImportCandidate>) {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  source(id: string, source: string, draft: BookFormValue): void {
    if (this.locked() || this.destroy.destroyed) return;
    const row = this.row(id);
    if (row && ['imported', 'uncertain', 'discarded'].includes(row.state)) return;
    this.reads.get(id)?.unsubscribe();
    if (!row)
      this.rows.update((rows) => [
        ...rows,
        {
          id,
          source,
          draft: structuredClone(draft),
          request: null,
          state: 'pending',
          selected: false,
          revision: 0,
          duplicates: null,
          approvedMatches: null,
          bookId: null,
          message: null,
        },
      ]);
    else
      this.update(id, {
        draft: structuredClone(draft),
        request: null,
        state: 'pending',
        selected: false,
        revision: row.revision + 1,
        duplicates: null,
        approvedMatches: null,
        message: null,
      });
  }
  addManual(): void {
    if (this.locked()) return;
    const id = `manual:${++this.manualId}`;
    this.source(id, 'Añadido manualmente', emptyPhotoDraft());
    this.review(id);
  }
  review(id: string): void {
    const row = this.row(id);
    if (!row || this.locked() || ['imported', 'uncertain', 'discarded'].includes(row.state)) return;
    this.reads.get(id)?.unsubscribe();
    const revision = row.revision + 1;
    // Opening revision invalidates the old authorization even if the dialog is cancelled.
    this.update(id, {
      revision,
      state: 'pending',
      request: null,
      selected: false,
      duplicates: null,
      approvedMatches: null,
      message: null,
    });
    this.dialogOpen.set(true);
    const ref = this.dialogs.open<PhotoImportReviewDialog, BookFormValue, BookRequest>(
      PhotoImportReviewDialog,
      { data: structuredClone(row.draft), width: '52rem', maxWidth: '95vw' },
    );
    this.dialogRef = ref;
    ref
      .afterClosed()
      .pipe(take(1))
      .subscribe((request) => {
        if (this.destroy.destroyed || this.dialogRef !== ref) return;
        this.dialogRef = null;
        this.dialogOpen.set(false);
        if (this.row(id)?.revision !== revision || !request || !validConfirmedBookRequest(request))
          return;
        this.update(id, {
          request: structuredClone(request),
          draft: requestDraft(request),
          state: 'reviewed',
        });
        this.check(id);
      });
  }
  private duplicates(request: BookRequest) {
    return forkJoin({
      advisory: this.books.metadataDuplicates(request.isbn ?? '', request.title, request.author),
      exact: request.isbn
        ? this.books.searchBooks({ isbn: request.isbn }, { page: 0, size: 1 })
        : of(null),
    });
  }
  private check(id: string, beforeWrite?: () => void): void {
    const row = this.row(id);
    if (!row?.request) {
      beforeWrite?.();
      return;
    }
    const revision = row.revision,
      generation = this.generation;
    this.update(id, {
      state: 'reviewed',
      selected: false,
      message: 'Comprobando duplicados; todavía no se permite importar.',
    });
    const subscription = this.duplicates(row.request).subscribe({
      next: ({ advisory, exact }) => {
        if (
          generation !== this.generation ||
          this.row(id)?.revision !== revision ||
          this.row(id)?.state === 'discarded'
        )
          return;
        if (
          !this.validMatches(advisory) ||
          (exact &&
            (!Number.isInteger(exact.totalElements) ||
              exact.totalElements < 0 ||
              !Array.isArray(exact.content)))
        ) {
          this.update(id, {
            state: 'error',
            message: 'Comprobación desconocida o incompleta; no se permite importar.',
          });
          beforeWrite?.();
          return;
        }
        const existing = advisory.matches.find((m) => m.kind !== 'POSSIBLE_TITLE_AUTHOR');
        if (existing || (exact && exact.totalElements > 0)) {
          this.update(id, {
            state: 'existing',
            duplicates: advisory,
            bookId: existing?.id ?? exact?.content[0]?.id ?? null,
            message: 'ISBN exacto o equivalente ya existente. No se creará otro libro.',
          });
          beforeWrite?.();
          return;
        }
        const signature = this.signature(advisory);
        if (
          (advisory.matches.length || advisory.truncated) &&
          this.row(id)?.approvedMatches !== signature
        ) {
          this.update(id, {
            state: 'possible',
            duplicates: advisory,
            message:
              'Revisa las posibles coincidencias y decide explícitamente si es otro libro o edición.',
          });
          beforeWrite?.();
          return;
        }
        this.update(id, { state: 'ready', duplicates: advisory, message: null });
        if (beforeWrite) this.post(id, beforeWrite);
      },
      error: () => {
        if (generation !== this.generation || this.row(id)?.revision !== revision) return;
        this.update(id, {
          state: 'error',
          message: 'Estado de duplicados desconocido. No se ha enviado ningún POST.',
        });
        beforeWrite?.();
      },
    });
    this.reads.set(id, subscription);
  }
  private signature(result: MetadataDuplicates) {
    return JSON.stringify([
      result.matches.map((m) => [m.id, m.kind, m.title, m.author, m.isbn]).sort(),
      result.truncated,
    ]);
  }

  private validMatches(result: MetadataDuplicates): boolean {
    return (
      !!result &&
      Array.isArray(result.matches) &&
      result.similarityChecked === true &&
      typeof result.truncated === 'boolean' &&
      result.matches.every(
        (match) =>
          !!match &&
          Number.isSafeInteger(match.id) &&
          match.id > 0 &&
          ['EXACT_ISBN', 'EQUIVALENT_ISBN', 'POSSIBLE_TITLE_AUTHOR'].includes(match.kind),
      )
    );
  }
  approvePossible(id: string): void {
    const row = this.row(id);
    if (this.locked() || row?.state !== 'possible' || !row.duplicates) return;
    this.confirm(
      {
        heading: 'Confirmar posible duplicado',
        message:
          'Las coincidencias pueden representar el mismo libro. Confirmo que he revisado el catálogo y quiero incorporar este libro o una edición diferente.',
        titles: row.duplicates.matches.map(
          (m) => `${m.title} — ${m.author} (${m.isbn ?? 'sin ISBN'})`,
        ),
      },
      () => {
        if (this.row(id)?.revision === row.revision)
          this.update(id, {
            approvedMatches: this.signature(row.duplicates!),
            state: 'ready',
            selected: false,
            message: 'Posible duplicado revisado y aceptado explícitamente.',
          });
      },
    );
  }
  select(id: string, selected: boolean): void {
    if (!this.locked() && this.row(id)?.state === 'ready') this.update(id, { selected });
  }
  selectAll(selected: boolean): void {
    if (!this.locked())
      this.rows.update((rows) =>
        rows.map((r) => ({ ...r, selected: selected && r.state === 'ready' })),
      );
  }
  discard(id: string): void {
    const row = this.row(id);
    if (this.locked() || !row || ['imported', 'uncertain'].includes(row.state)) return;
    this.reads.get(id)?.unsubscribe();
    this.update(id, {
      state: 'discarded',
      selected: false,
      revision: row.revision + 1,
      request: null,
    });
  }
  importSelected(): void {
    if (this.locked()) return;
    const queue = this.rows().filter(
      (r) => r.state === 'ready' && r.selected && r.request && validConfirmedBookRequest(r.request),
    );
    if (!queue.length) return;
    this.confirm(
      {
        heading: 'Importar libros seleccionados',
        message: `Se crearán individualmente los libros reales revisados. ${this.simulated() ? 'El reconocimiento es simulado; ningún ejemplo debe importarse sin verificar.' : 'OpenAI puede equivocarse: verifica los datos reales.'} Posibles duplicados aceptados se indican a continuación. No se añadirán a la lista de lectura.`,
        titles: queue.map(
          (r) =>
            `${r.request!.title} — ${r.request!.author}${r.approvedMatches ? ' (posible duplicado aceptado)' : ''}${!r.request!.isbn ? ' (sin ISBN)' : ''}`,
        ),
      },
      () => {
        this.creating.set(true);
        this.stopped.set(false);
        this.completed.set(0);
        this.total.set(queue.length);
        this.next(
          queue.map((r) => ({ id: r.id, revision: r.revision })),
          this.generation,
        );
      },
    );
  }
  private next(queue: { id: string; revision: number }[], generation: number): void {
    if (generation !== this.generation || this.destroy.destroyed) return;
    const next = this.stopped() ? undefined : queue.shift();
    if (!next) {
      this.creating.set(false);
      return;
    }
    const row = this.row(next.id);
    const advance = () => {
      this.completed.update((n) => n + 1);
      this.next(queue, generation);
    };
    if (
      !row ||
      row.revision !== next.revision ||
      row.state !== 'ready' ||
      !row.request ||
      !validConfirmedBookRequest(row.request)
    ) {
      advance();
      return;
    }
    this.check(row.id, advance);
  }
  private post(id: string, advance: () => void): void {
    const row = this.row(id);
    if (
      this.stopped() ||
      !row?.request ||
      row.state !== 'ready' ||
      !validConfirmedBookRequest(row.request)
    ) {
      advance();
      return;
    }
    const generation = this.generation;
    this.update(id, { state: 'importing', selected: false, message: null });
    this.write = this.books.createBook(structuredClone(row.request)).subscribe({
      next: (book) => {
        if (generation !== this.generation) return;
        if (book && Number.isSafeInteger(book.id) && book.id > 0)
          this.update(id, {
            state: 'imported',
            bookId: book.id,
            message: 'Libro creado y confirmado.',
          });
        else {
          this.update(id, {
            state: 'uncertain',
            message: 'Confirmación inválida: el libro podría haberse creado.',
          });
          this.reconcile(id, true);
        }
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.update(
          id,
          status === 400
            ? {
                state: 'error',
                request: null,
                message: 'Datos rechazados. Revisa y confirma de nuevo.',
              }
            : {
                state: 'uncertain',
                message:
                  status === 409
                    ? 'Conflicto de ISBN. Consultando el catálogo, sin repetir POST.'
                    : 'Resultado incierto: el servidor podría haber creado el libro. No se repetirá el POST.',
              },
        );
        if (status !== 400) this.reconcile(id, true);
        advance();
      },
      complete: advance,
    });
  }
  stop(): void {
    if (this.creating()) this.stopped.set(true);
  }
  reconcile(id: string, internal = false): void {
    const row = this.row(id);
    if ((!internal && this.locked()) || row?.state !== 'uncertain' || !row.request) return;
    const revision = row.revision;
    this.reads.get(id)?.unsubscribe();
    this.update(id, { duplicates: null });
    this.reads.set(
      id,
      this.duplicates(row.request).subscribe({
        next: ({ advisory, exact }) => {
          if (
            this.destroy.destroyed ||
            this.row(id)?.revision !== revision ||
            this.row(id)?.state !== 'uncertain'
          )
            return;
          if (
            !this.validMatches(advisory) ||
            (exact &&
              (!Array.isArray(exact.content) ||
                !Number.isInteger(exact.totalElements) ||
                exact.totalElements < 0))
          )
            return;
          const found = advisory.matches.find((m) => m.kind !== 'POSSIBLE_TITLE_AUTHOR');
          if (found || (exact && exact.totalElements > 0))
            this.update(id, {
              state: 'existing',
              duplicates: advisory,
              bookId: found?.id ?? exact?.content[0]?.id ?? null,
              message:
                'El ISBN existe. No se atribuye esta alta a la petición anterior ni se repetirá POST.',
            });
          else
            this.update(id, {
              duplicates: advisory,
              message:
                'Resultado aún incierto. Las similitudes no identifican inequívocamente la creación, especialmente sin ISBN. Una petición anterior aún podría terminar.',
            });
        },
        error: () => {
          if (!this.destroy.destroyed && this.row(id)?.revision === revision)
            this.update(id, {
              message: 'Resultado incierto; falló la consulta. No se permite repetir el POST.',
            });
        },
      }),
    );
  }
  authorizeRetry(id: string): void {
    const row = this.row(id);
    if (this.locked() || row?.state !== 'uncertain' || !row.duplicates) return;
    this.confirm(
      {
        heading: 'Reintento con riesgo de duplicado',
        message:
          'La petición anterior podría terminar todavía. Sin ISBN no existe reconciliación inequívoca. Confirmo que he consultado el catálogo y acepto el riesgo; tendré que revisar y seleccionar de nuevo.',
        titles: [row.draft.title],
      },
      () => {
        if (this.row(id)?.state !== 'uncertain') return;
        this.reads.get(id)?.unsubscribe();
        this.update(id, {
          state: 'pending',
          request: null,
          revision: row.revision + 1,
          duplicates: null,
          approvedMatches: null,
          message: 'Reintento autorizado; requiere una nueva revisión y selección.',
        });
      },
    );
  }
  private confirm(data: PhotoImportConfirmation, action: () => void): void {
    if (this.locked()) return;
    this.dialogOpen.set(true);
    const ref = this.dialogs.open<PhotoImportConfirmDialog, PhotoImportConfirmation, boolean>(
      PhotoImportConfirmDialog,
      { data, width: '36rem', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    this.dialogRef = ref;
    ref
      .afterClosed()
      .pipe(take(1))
      .subscribe((accepted) => {
        if (this.destroy.destroyed || this.dialogRef !== ref) return;
        this.dialogRef = null;
        this.dialogOpen.set(false);
        if (accepted === true) action();
      });
  }
  canLeave(): boolean | Observable<boolean> {
    if (this.creating() || this.dialogOpen() || this.reading.locked()) return false;
    if (!this.pendingWork() && !this.reading.pending()) return true;
    this.dialogOpen.set(true);
    const ref = this.dialogs.open<PhotoImportConfirmDialog, PhotoImportConfirmation, boolean>(
      PhotoImportConfirmDialog,
      {
        data: {
          heading: 'Abandonar importación',
          message:
            'Hay candidatos revisados, selecciones de lectura pendientes o resultados inciertos. Se perderán los borradores y fotografías; las altas ya realizadas no se deshacen.',
          titles: [],
        },
      },
    );
    this.dialogRef = ref;
    return ref.afterClosed().pipe(
      take(1),
      map((value) => value === true),
      finalize(() => {
        if (this.dialogRef === ref) {
          this.dialogRef = null;
          this.dialogOpen.set(false);
        }
      }),
    );
  }
  label(state: PhotoCandidateState): string {
    return {
      pending: 'Pendiente de revisión',
      reviewed: 'Revisado; comprobación pendiente',
      possible: 'Posible duplicado',
      existing: 'Ya existente',
      ready: 'Preparado para importar',
      importing: 'Importando',
      imported: 'Importado',
      error: 'Error',
      uncertain: 'Resultado incierto',
      discarded: 'Descartado',
    }[state];
  }
}

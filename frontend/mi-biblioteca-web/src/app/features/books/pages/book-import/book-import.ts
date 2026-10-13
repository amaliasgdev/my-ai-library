import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EMPTY,
  Subscription,
  catchError,
  finalize,
  from,
  mergeMap,
  of,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { BookImportReviewDialog } from '../../components/book-import-review-dialog/book-import-review-dialog';
import { BookFormValue } from '../../components/book-form/book-form.helpers';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from '../../models/book-catalog-query';
import {
  IsbnImportRow,
  importDraft,
  importRow,
  parseBulkIsbnImport,
} from '../../models/bulk-isbn-import';
import { BookRequest } from '../../models/book.models';
import { BooksService } from '../../services/books.service';

@Component({
  selector: 'app-book-import',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './book-import.html',
  styleUrl: './book-import.scss',
})
export class BookImport {
  private readonly service = inject(BooksService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly catalogParams = serializeBookCatalogQuery(
    parseBookCatalogQuery(inject(ActivatedRoute).snapshot.queryParamMap),
  );
  readonly text = new FormControl('', { nonNullable: true });
  readonly rows = signal<IsbnImportRow[]>([]);
  readonly error = signal<string | null>(null);
  readonly checking = signal(false);
  readonly creating = signal(false);
  readonly stopped = signal(false);
  readonly completed = signal(0);
  readonly total = signal(0);
  readonly selectedCount = computed(
    () => this.rows().filter((row) => row.selected && row.creation === 'ready').length,
  );
  readonly createdCount = computed(
    () => this.rows().filter((row) => row.creation === 'created').length,
  );
  readonly existingCount = computed(
    () => this.rows().filter((row) => row.existence === 'existing').length,
  );
  readonly uncertainCount = computed(
    () =>
      this.rows().filter((row) => row.creation === 'uncertain' && row.existence !== 'existing')
        .length,
  );
  readonly failedCount = computed(
    () =>
      this.rows().filter((row) => row.creation === 'error' && row.existence !== 'existing').length,
  );
  readonly writeTotal = signal(0);
  readonly writeCompleted = signal(0);
  private generation = 0;
  private checks: Subscription | null = null;
  private write: Subscription | null = null;
  private reviewRef: MatDialogRef<BookImportReviewDialog, BookRequest> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.checks?.unsubscribe();
      this.write?.unsubscribe();
      const ref = this.reviewRef;
      this.reviewRef = null;
      ref?.close();
    });
  }

  analyze(): void {
    if (this.destroyRef.destroyed || this.checking() || this.creating() || this.reviewRef) return;
    const result = parseBulkIsbnImport(this.text.value);
    this.error.set(result.error);
    this.rows.set(result.entries.map(importRow));
    this.generation++;
    if (result.error) return;
    this.runChecks(this.rows().filter((row) => row.isbn !== null));
  }

  private update(id: number, patch: Partial<IsbnImportRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  private runChecks(rows: IsbnImportRow[]): void {
    const generation = this.generation;
    this.completed.set(0);
    this.total.set(rows.length);
    this.checking.set(true);
    this.checks = from(rows)
      .pipe(
        mergeMap((row) => {
          let existenceChecked = false;
          this.update(row.id, { existence: 'pending', metadata: 'pending', message: null });
          return this.service.searchBooks({ isbn: row.isbn! }, { page: 0, size: 1 }).pipe(
            switchMap((page) => {
              if (generation !== this.generation) return EMPTY;
              if (
                !Number.isInteger(page.totalElements) ||
                page.totalElements < 0 ||
                !Array.isArray(page.content)
              )
                throw new Error('Invalid existence response');
              if (page.totalElements > 0) {
                this.update(row.id, { existence: 'existing', bookId: page.content[0]?.id ?? null });
                return of(null);
              }
              existenceChecked = true;
              this.update(row.id, { existence: 'new' });
              return this.service.lookupByIsbn(row.isbn!).pipe(
                tap((proposal) => {
                  if (generation === this.generation)
                    this.update(row.id, {
                      metadata: 'found',
                      draft: importDraft(row.isbn!, proposal),
                    });
                }),
              );
            }),
            catchError((error: unknown) => {
              if (generation === this.generation) {
                const notFound =
                  existenceChecked && error instanceof HttpErrorResponse && error.status === 404;
                this.update(
                  row.id,
                  existenceChecked
                    ? {
                        metadata: notFound ? 'notFound' : 'error',
                        message: notFound
                          ? 'No se encontraron metadatos; puedes completar los datos manualmente'
                          : 'Error al consultar metadatos',
                      }
                    : { existence: 'error', message: 'Error al comprobar existencia' },
                );
              }
              return of(null);
            }),
            finalize(() => {
              if (generation === this.generation) this.completed.update((value) => value + 1);
            }),
          );
        }, 2),
        finalize(() => {
          if (generation === this.generation) this.checking.set(false);
        }),
      )
      .subscribe();
  }

  cancelChecks(): void {
    if (!this.checking()) return;
    this.generation++;
    this.checks?.unsubscribe();
    this.checks = null;
    this.checking.set(false);
    this.rows.update((rows) =>
      rows.map((row) =>
        row.isbn &&
        (row.existence === 'pending' || (row.existence === 'new' && row.metadata === 'pending'))
          ? { ...row, existence: 'error', message: 'Consulta cancelada; reintenta explícitamente' }
          : row,
      ),
    );
  }

  retryLookup(row: IsbnImportRow): void {
    const current = this.rows().find((item) => item.id === row.id);
    if (!current) return;
    row = current;
    if (
      this.destroyRef.destroyed ||
      this.checking() ||
      this.creating() ||
      this.reviewRef ||
      !row.isbn ||
      row.creation !== 'notReady' ||
      !(row.existence === 'error' || row.metadata === 'error' || row.metadata === 'notFound')
    )
      return;
    this.runChecks([row]);
  }

  canReview(row: IsbnImportRow): boolean {
    const current = this.rows().find((item) => item.id === row.id);
    if (!current) return false;
    row = current;
    return (
      !this.destroyRef.destroyed &&
      !!row.isbn &&
      row.existence === 'new' &&
      row.metadata !== 'pending' &&
      !['creating', 'created', 'uncertain'].includes(row.creation) &&
      !this.checking() &&
      !this.creating()
    );
  }

  review(row: IsbnImportRow): void {
    const current = this.rows().find((item) => item.id === row.id);
    if (!current) return;
    row = current;
    if (this.reviewRef || !this.canReview(row)) return;
    const generation = this.generation;
    const ref = this.dialog.open<BookImportReviewDialog, BookFormValue, BookRequest>(
      BookImportReviewDialog,
      {
        data: { ...row.draft, genres: [...row.draft.genres] },
        width: '52rem',
        maxWidth: '95vw',
        autoFocus: 'input',
        restoreFocus: true,
      },
    );
    this.reviewRef = ref;
    ref
      .afterClosed()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((request) => {
        if (this.reviewRef !== ref || generation !== this.generation) return;
        this.reviewRef = null;
        if (!request || request.isbn !== row.isbn) return;
        this.update(row.id, {
          request,
          draft: {
            ...request,
            title: request.title,
            author: request.author,
            isbn: row.isbn!,
            description: request.description ?? '',
            coverUrl: request.coverUrl ?? '',
            publisher: request.publisher ?? '',
            language: request.language ?? '',
            genres: [...request.genres],
            room: request.room ?? '',
            bookcase: request.bookcase ?? '',
            shelf: request.shelf ?? '',
            shelfId: request.location?.kind === 'SHELF' ? request.location.shelfId : null,
          },
          creation: 'ready',
          selected: true,
          message: null,
        });
      });
  }

  select(row: IsbnImportRow, selected: boolean): void {
    const current = this.rows().find((item) => item.id === row.id);
    if (!current) return;
    row = current;
    if (this.creating() || this.checking() || row.creation !== 'ready' || row.existence !== 'new')
      return;
    this.update(row.id, { selected });
  }

  importSelected(): void {
    if (this.destroyRef.destroyed || this.creating() || this.checking() || this.reviewRef) return;
    const queue = this.rows().filter(
      (row) =>
        row.isbn &&
        row.selected &&
        row.creation === 'ready' &&
        row.existence === 'new' &&
        row.request?.isbn === row.isbn,
    );
    if (!queue.length) return;
    this.creating.set(true);
    this.stopped.set(false);
    this.writeTotal.set(queue.length);
    this.writeCompleted.set(0);
    this.createNext(queue, this.generation);
  }

  private createNext(queue: IsbnImportRow[], generation: number): void {
    if (generation !== this.generation) return;
    const row = this.stopped() ? undefined : queue.shift();
    if (!row) {
      this.creating.set(false);
      return;
    }
    this.update(row.id, { creation: 'creating', message: null });
    this.write = this.service.createBook(row.request!).subscribe({
      next: (book) => {
        if (generation !== this.generation) return;
        this.update(
          row.id,
          book && Number.isSafeInteger(book.id) && book.id > 0
            ? { creation: 'created', selected: false, bookId: book.id }
            : {
                creation: 'uncertain',
                selected: false,
                message: 'Confirmación no válida; comprueba el ISBN antes de reintentar',
              },
        );
        this.writeCompleted.update((value) => value + 1);
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        const locationError =
          error instanceof HttpErrorResponse &&
          ['LOCATION_NOT_FOUND', 'LOCATION_IN_USE'].includes(error.error?.code);
        this.update(
          row.id,
          status === 409 && !locationError
            ? {
                creation: 'error',
                existence: 'existing',
                conflict: true,
                selected: false,
                message: 'Conflicto: el ISBN ya existe; no se ha sobrescrito',
              }
            : status === 400 || locationError
              ? {
                  creation: 'error',
                  selected: false,
                  message: locationError
                    ? 'La ubicación ya no está disponible; revisa y confirma otra balda'
                    : 'Datos rechazados; revisa y confirma de nuevo',
                }
              : {
                  creation: 'uncertain',
                  selected: false,
                  message:
                    'Resultado incierto. Comprueba el ISBN antes de reintentar; el servidor podría haber guardado el libro',
                },
        );
        this.writeCompleted.update((value) => value + 1);
        this.createNext(queue, generation);
      },
      complete: () => this.createNext(queue, generation),
    });
  }

  stopCreation(): void {
    if (this.creating()) this.stopped.set(true);
  }

  reconcile(row: IsbnImportRow): void {
    const current = this.rows().find((item) => item.id === row.id);
    if (!current) return;
    row = current;
    if (
      this.destroyRef.destroyed ||
      this.checking() ||
      this.creating() ||
      this.reviewRef ||
      row.creation !== 'uncertain' ||
      !row.isbn
    )
      return;
    const generation = this.generation;
    this.checking.set(true);
    this.total.set(1);
    this.completed.set(0);
    this.checks = this.service
      .searchBooks({ isbn: row.isbn }, { page: 0, size: 1 })
      .pipe(
        finalize(() => {
          if (generation === this.generation) {
            this.checking.set(false);
            this.completed.set(1);
          }
        }),
      )
      .subscribe({
        next: (page) => {
          if (generation !== this.generation) return;
          if (
            !Number.isInteger(page.totalElements) ||
            page.totalElements < 0 ||
            !Array.isArray(page.content)
          ) {
            this.update(row.id, {
              message: 'Error al comprobar existencia; no se permite reintentar el POST',
            });
            return;
          }
          this.update(
            row.id,
            page.totalElements > 0
              ? {
                  existence: 'existing',
                  bookId: page.content[0]?.id ?? null,
                  selected: false,
                  message:
                    'El ISBN existe; no se enviará otro POST. No podemos atribuir esta creación a la petición anterior',
                }
              : {
                  existence: 'new',
                  creation: 'ready',
                  selected: false,
                  message:
                    'No aparece todavía. Puedes seleccionar y reintentar explícitamente; una petición anterior aún podría terminar',
                },
          );
        },
        error: () => {
          if (generation === this.generation)
            this.update(row.id, {
              message: 'Error al comprobar existencia; no se permite reintentar el POST',
            });
        },
      });
  }

  status(row: IsbnImportRow): string {
    if (!row.isbn) return row.ambiguous ? 'Entrada ambigua' : 'ISBN inválido';
    if (row.creation === 'created') return 'Creado';
    if (row.conflict) return 'Conflicto';
    if (row.existence === 'existing') return 'Ya existe';
    if (row.creation === 'uncertain') return 'Resultado incierto';
    if (row.creation === 'creating') return 'Creando';
    if (row.creation === 'ready') return 'Listo';
    if (row.existence === 'error' || row.metadata === 'error' || row.creation === 'error')
      return 'Error';
    if (row.metadata === 'notFound') return 'No encontrado';
    if (row.metadata === 'found') return 'Metadatos encontrados; falta confirmar';
    return 'Pendiente';
  }
}

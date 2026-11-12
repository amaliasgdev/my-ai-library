import { DatePipe } from '@angular/common';
import { ReadingListMembership } from '../../../reading-list/reading-list-membership';
import { ReadingListAction } from '../../../reading-list/reading-list-action';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { StarRating } from '../../components/star-rating/star-rating';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  finalize,
  map,
  of,
  startWith,
  Subject,
  Subscription,
  switchMap,
} from 'rxjs';
import {
  BookDeleteDialog,
  BookDeleteDialogData,
} from '../../components/book-delete-dialog/book-delete-dialog';
import {
  bookDeleteDialogConfig,
  bookDeleteError,
} from '../../components/book-delete-dialog/book-delete.helpers';
import { displayReadingDate, READING_STATUS_LABELS } from '../../models/book-display';
import { parseBookId } from '../../models/book-id';
import { BookResponse } from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import { SagasService } from '../../../sagas/services/sagas.service';
import { BookSagaMembership } from '../../../sagas/models/saga.models';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from '../../models/book-catalog-query';
import { FeedbackService } from '../../../../core/ui/feedback/feedback.service';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';

type DetailState =
  | { status: 'loading' }
  | { status: 'loaded'; id: number; book: BookResponse }
  | { status: 'error'; id: number | null; message: string };

function loadError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) return 'El libro no existe';
    if (error.status === 0) return 'No se puede conectar con el servidor';
  }
  return 'No se pudo cargar el libro';
}

function sagasLoadError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status >= 500 && error.status < 600)
      return 'El servidor no pudo cargar las sagas del libro';
  }
  return 'No se pudieron cargar las sagas del libro';
}

@Component({
  selector: 'app-book-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    InlineFeedback,
    LoadingState,
    ReadingListAction,
    StarRating,
  ],
  providers: [ReadingListMembership],
  templateUrl: './book-detail.html',
  styleUrl: './book-detail.scss',
})
export class BookDetail {
  readonly membership = inject(ReadingListMembership);
  private readonly service = inject(BooksService);
  private readonly sagasService = inject(SagasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  private readonly retryRequested = new Subject<void>();
  private readonly sagasRetry = new Subject<void>();
  private confirmation: MatDialogRef<BookDeleteDialog, boolean> | null = null;
  private deleteSubscription: Subscription | null = null;
  private generation = 0;
  readonly state = signal<DetailState>({ status: 'loading' });
  readonly imageFailed = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly sagas = signal<BookSagaMembership[]>([]);
  readonly sagasState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  readonly sagasError = signal<string | null>(null);
  readonly statusLabels = READING_STATUS_LABELS;
  readonly displayDate = displayReadingDate;

  catalogParams() {
    return serializeBookCatalogQuery(parseBookCatalogQuery(this.route.snapshot.queryParamMap));
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.cancelDelete();
    });
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((rawId) => {
          this.generation++;
          this.cancelDelete();
          this.deleteError.set(null);
          const id = parseBookId(rawId);
          if (id === null)
            return of<DetailState>({
              status: 'error',
              id: null,
              message: 'El identificador del libro no es válido',
            });
          return this.retryRequested.pipe(
            startWith(undefined),
            switchMap(() => {
              this.imageFailed.set(false);
              return this.service.getBook(id).pipe(
                map((book): DetailState => ({ status: 'loaded', id, book })),
                catchError((error: unknown) =>
                  of<DetailState>({ status: 'error', id, message: loadError(error) }),
                ),
                startWith<DetailState>({ status: 'loading' }),
              );
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        this.membership.setBooks(state.status === 'loaded' ? [state.id] : []);
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((rawId) => {
          const id = parseBookId(rawId);
          this.sagas.set([]);
          this.sagasError.set(null);
          if (id === null) {
            this.sagasState.set('idle');
            return EMPTY;
          }
          return this.sagasRetry.pipe(
            startWith(undefined),
            switchMap(() => {
              this.sagasState.set('loading');
              return this.sagasService.getBookSagas(id).pipe(
                map((list) => ({ kind: 'success' as const, list })),
                catchError((error: unknown) =>
                  of({ kind: 'error' as const, message: sagasLoadError(error) }),
                ),
                startWith({ kind: 'loading' as const }),
              );
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.kind === 'loading') {
          this.sagasState.set('loading');
          return;
        }
        if (result.kind === 'success') {
          this.sagas.set(result.list);
          this.sagasState.set('loaded');
          this.sagasError.set(null);
          return;
        }
        this.sagasState.set('error');
        this.sagasError.set(result.message);
      });
  }

  retrySagas(): void {
    if (this.sagasState() === 'error') this.sagasRetry.next();
  }

  retry(): void {
    const state = this.state();
    if (state.status === 'error' && state.id !== null && !this.deleting())
      this.retryRequested.next();
  }

  openDeleteDialog(): void {
    const state = this.state();
    if (state.status !== 'loaded' || this.deleting() || this.confirmation) return;
    const generation = this.generation;
    const ref = this.dialog.open<BookDeleteDialog, BookDeleteDialogData, boolean>(
      BookDeleteDialog,
      bookDeleteDialogConfig(state.book.title),
    );
    this.confirmation = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.confirmation === ref) this.confirmation = null;
        if (confirmed === true && generation === this.generation && !this.deleting())
          this.deleteBook(state.id, generation);
      });
  }

  private deleteBook(id: number, generation: number): void {
    this.deleting.set(true);
    this.deleteError.set(null);
    this.deleteSubscription = this.service
      .deleteBook(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation === this.generation) this.deleting.set(false);
        }),
      )
      .subscribe({
        next: () => {
          if (generation === this.generation) {
            this.feedback.success('Libro eliminado.');
            const queryParams = this.catalogParams();
            if (Object.keys(queryParams).length)
              void this.router.navigate(['/books'], { queryParams });
            else void this.router.navigate(['/books']);
          }
        },
        error: (error: unknown) => {
          if (generation === this.generation) this.deleteError.set(bookDeleteError(error));
        },
      });
  }

  private cancelDelete(): void {
    const ref = this.confirmation;
    this.confirmation = null;
    ref?.close(false);
    this.deleteSubscription?.unsubscribe();
    this.deleteSubscription = null;
    this.deleting.set(false);
  }
}

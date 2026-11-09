import { HttpErrorResponse } from '@angular/common/http';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { catchError, map, Observable, of, startWith, Subject, switchMap } from 'rxjs';
import { BookReadingDatesDialog } from '../books/components/book-reading-dates-dialog/book-reading-dates-dialog';
import { displayReadingDate, READING_STATUS_LABELS } from '../books/models/book-display';
import { ReadingStatus } from '../books/models/book.models';
import { localDateString } from '../books/models/reading-date';
import { BooksService } from '../books/services/books.service';
import { ReadingListItem, ReadingListResponse } from './reading-list.models';
import { ReadingListService } from './reading-list.service';

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'loaded'; response: ReadingListResponse };

@Component({
  selector: 'app-reading-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    DragDropModule,
  ],
  templateUrl: './reading-list.html',
  styleUrl: './reading-list.scss',
})
export class ReadingList {
  private readonly api = inject(ReadingListService);
  private readonly books = inject(BooksService);
  private readonly dialogs = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly reload = new Subject<void>();
  private datesDialog: MatDialogRef<BookReadingDatesDialog> | null = null;
  private focusEntry: number | null = null;
  readonly state = signal<LoadState>({ status: 'loading' });
  readonly filter = signal<ReadingStatus | null>(null);
  readonly busy = signal(false);
  readonly synchronizing = signal(false);
  readonly notice = signal('');
  readonly failedCovers = signal<ReadonlySet<string>>(new Set());
  readonly labels = READING_STATUS_LABELS;
  readonly statuses: ReadingStatus[] = ['TO_READ', 'READING', 'READ', 'ABANDONED'];
  readonly displayDate = displayReadingDate;

  constructor() {
    this.reload
      .pipe(
        startWith(undefined),
        switchMap(() => {
          this.state.set({ status: 'loading' });
          return this.api.getList(this.filter()).pipe(
            map((response): LoadState => ({ status: 'loaded', response })),
            catchError(() => of<LoadState>({ status: 'error' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        if (state.status === 'loaded') {
          this.synchronizing.set(false);
          this.busy.set(false);
          if (this.focusEntry !== null) {
            const id = this.focusEntry;
            this.focusEntry = null;
            afterNextRender(
              () => {
                const target =
                  this.element.nativeElement.querySelector<HTMLElement>(`[data-entry="${id}"]`) ??
                  this.element.nativeElement.querySelector<HTMLElement>('h1');
                target?.focus();
              },
              { injector: this.injector },
            );
          }
        }
      });
    this.destroyRef.onDestroy(() => {
      this.datesDialog?.close();
      this.datesDialog = null;
    });
  }

  changeFilter(status: ReadingStatus | null): void {
    if (this.busy() || this.datesDialog || status === this.filter()) return;
    this.filter.set(status);
    this.notice.set('');
    this.reload.next();
  }

  retry(): void {
    if (this.datesDialog || (this.busy() && this.state().status !== 'error')) return;
    this.reload.next();
  }

  coverFailed(url: string): void {
    this.failedCovers.update((values) => new Set([...values, url]));
  }

  private current(item: ReadingListItem): ReadingListResponse | null {
    const state = this.state();
    return !this.busy() && state.status === 'loaded' && state.response.items.includes(item)
      ? state.response
      : null;
  }

  move(item: ReadingListItem, delta: -1 | 1): void {
    this.moveTo(item, item.position + delta);
  }

  drop(event: CdkDragDrop<ReadingListItem[]>): void {
    const state = this.state();
    if (
      state.status !== 'loaded' ||
      !event.isPointerOverContainer ||
      event.previousContainer !== event.container ||
      event.previousIndex === event.currentIndex
    )
      return;
    const item = event.item.data as ReadingListItem;
    if (state.response.items[event.previousIndex] !== item) return;
    const target = state.response.items[event.currentIndex];
    if (target) this.moveTo(item, target.position);
  }

  private moveTo(item: ReadingListItem, target: number): void {
    const response = this.current(item);
    if (
      !response ||
      this.datesDialog ||
      this.filter() ||
      target < 1 ||
      target > response.totalItems
    )
      return;
    this.focusEntry = item.entryId;
    this.write(
      this.api.move(item.entryId, target, response.revision),
      `Posición de lectura actualizada: ${target}.`,
    );
  }

  remove(item: ReadingListItem): void {
    const response = this.current(item);
    if (!response || this.datesDialog) return;
    this.write(
      this.api.remove(item.entryId, response.revision),
      'Libro retirado de la lista. Sigue en el catálogo.',
    );
  }

  statusChanged(item: ReadingListItem, event: MatSelectChange): void {
    const status = event.value as ReadingStatus;
    event.source.value = item.book.readingStatus;
    if (
      !this.current(item) ||
      this.datesDialog ||
      status === item.book.readingStatus ||
      !this.statuses.includes(status)
    )
      return;
    this.write(
      this.books.updateReadingStatus(item.book.id, status),
      'Estado actualizado. Las fechas no se han modificado.',
    );
  }

  quickReading(item: ReadingListItem, action: 'start' | 'finish'): void {
    if (!this.current(item) || this.datesDialog) return;
    const status = item.book.readingStatus;
    if (action === 'start' ? status !== 'TO_READ' : status !== 'TO_READ' && status !== 'READING')
      return;
    const request = { date: localDateString(new Date()) };
    this.write(
      action === 'start'
        ? this.books.startReading(item.book.id, request)
        : this.books.finishReading(item.book.id, request),
      action === 'start' ? 'Lectura iniciada.' : 'Lectura finalizada.',
    );
  }

  manageDates(item: ReadingListItem): void {
    if (!this.current(item) || this.datesDialog) return;
    const ref = this.dialogs.open(BookReadingDatesDialog, {
      data: item.book,
      width: '34rem',
      maxWidth: '95vw',
    });
    this.datesDialog = ref;
    const instance = ref.componentInstance;
    instance.cancelRequested.subscribe(() => {
      if (!this.busy()) ref.close();
    });
    instance.saveRequested.subscribe((request) => {
      if (this.current(item))
        this.write(
          this.books.updateReadingDates(item.book.id, request),
          'Fechas actualizadas.',
          ref,
        );
    });
    instance.deleteRequested.subscribe(() => {
      if (this.current(item))
        this.write(this.books.deleteReadingDates(item.book.id), 'Fechas eliminadas.', ref, true);
    });
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.datesDialog = null;
      });
  }

  private write(
    request: Observable<unknown>,
    success: string,
    dialog?: MatDialogRef<BookReadingDatesDialog>,
    deletingDates = false,
  ): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set('Guardando cambios…');
    if (dialog) {
      dialog.disableClose = true;
      dialog.componentInstance.error.set(null);
      dialog.componentInstance.setPending(
        true,
        deletingDates ? 'deleteReadingDates' : 'updateReadingDates',
      );
    }
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        dialog?.close();
        this.notice.set(success);
        this.synchronizing.set(true);
        this.reload.next();
      },
      error: (error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 409 || status === 0 || status >= 500) {
          dialog?.close();
          this.notice.set(
            status === 409
              ? 'La lista o el libro han cambiado. Se consulta el estado actual.'
              : 'Resultado incierto: el cambio podría haberse guardado. Se consulta el estado sin repetirlo.',
          );
          this.synchronizing.set(true);
          this.reload.next();
        } else {
          this.busy.set(false);
          const message =
            status === 404
              ? 'El libro o la entrada ya no existe. Actualiza la lista.'
              : 'No se pudo guardar el cambio. Revisa los datos.';
          this.notice.set(message);
          if (dialog) {
            dialog.disableClose = false;
            dialog.componentInstance.setPending(false);
            dialog.componentInstance.error.set(message);
          }
          this.focusEntry = null;
        }
      },
    });
  }
}

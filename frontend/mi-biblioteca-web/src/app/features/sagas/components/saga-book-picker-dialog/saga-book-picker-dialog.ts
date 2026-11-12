import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { finalize } from 'rxjs';
import { EmptyState } from '../../../../core/ui/feedback/empty-state';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import {
  BookPageResponse,
  BookResponse,
  BookSearchRequest,
} from '../../../books/models/book.models';
import { BooksService } from '../../../books/services/books.service';
import { spanishSagaPaginator } from '../../models/saga-paginator';

export interface SagaBookPickerDialogData {
  title: string;
  actionLabel: string;
  excludedBookIds: readonly number[];
}

@Component({
  selector: 'app-saga-book-picker-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    EmptyState,
    InlineFeedback,
    LoadingState,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: spanishSagaPaginator }],
  templateUrl: './saga-book-picker-dialog.html',
  styleUrl: './saga-book-picker-dialog.scss',
})
export class SagaBookPickerDialog {
  readonly data = inject<SagaBookPickerDialogData>(MAT_DIALOG_DATA);
  private readonly books = inject(BooksService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef =
    inject<MatDialogRef<SagaBookPickerDialog, BookResponse>>(MatDialogRef);
  readonly searchForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly criteriaError = signal(false);
  readonly searched = signal(false);
  readonly results = signal<BookPageResponse | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly totalElements = signal(0);
  readonly selected = signal<BookResponse | null>(null);
  readonly failedCovers = signal<ReadonlySet<number>>(new Set());
  readonly pageSizeOptions = [5, 10, 20, 50];
  private criteria: BookSearchRequest | null = null;
  private generation = 0;

  search(): void {
    const title = this.searchForm.controls.title.value.trim();
    const author = this.searchForm.controls.author.value.trim();
    if (!title && !author) {
      this.criteriaError.set(true);
      this.searchForm.controls.title.markAsTouched();
      return;
    }
    this.criteriaError.set(false);
    this.criteria = {
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
    };
    this.pageIndex.set(0);
    this.load();
  }

  clear(): void {
    this.generation++;
    this.searchForm.reset();
    this.criteria = null;
    this.results.set(null);
    this.totalElements.set(0);
    this.pageIndex.set(0);
    this.searched.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.criteriaError.set(false);
    this.selected.set(null);
  }

  onPageChange(event: PageEvent): void {
    const page = event.pageSize === this.pageSize() ? event.pageIndex : 0;
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(page);
    this.load();
  }

  retry(): void {
    this.load();
  }

  isExcluded(bookId: number): boolean {
    return this.data.excludedBookIds.includes(bookId);
  }

  select(book: BookResponse): void {
    if (this.isExcluded(book.id)) return;
    this.selected.set(book);
  }

  confirm(): void {
    const selected = this.selected();
    if (selected) this.dialogRef.close(selected);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  coverFailed(bookId: number): boolean {
    return this.failedCovers().has(bookId);
  }

  markCoverFailed(bookId: number): void {
    this.failedCovers.update((failed) => new Set(failed).add(bookId));
  }

  private load(): void {
    if (!this.criteria) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.searched.set(true);
    this.selected.set(null);
    this.books
      .searchBooks(this.criteria, {
        page: this.pageIndex(),
        size: this.pageSize(),
        sortBy: 'title',
        direction: 'ASC',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation === this.generation) this.loading.set(false);
        }),
      )
      .subscribe({
        next: (response) => {
          if (generation !== this.generation) return;
          this.results.set(response);
          this.totalElements.set(response.totalElements);
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          this.error.set(this.searchError(error));
        },
      });
  }

  private searchError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se puede conectar con el servidor';
      if (error.status === 400) return 'Revisa los criterios de búsqueda';
      if (error.status >= 500 && error.status < 600) return 'El servidor no pudo buscar libros';
    }
    return 'No se pudieron buscar libros';
  }
}

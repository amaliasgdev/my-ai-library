import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../../../core/ui/feedback/empty-state';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import { readingPercent } from '../../models/saga-progress';
import { spanishSagaPaginator } from '../../models/saga-paginator';
import { SagaPageResponse } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

type ListState =
  | { status: 'loading' }
  | { status: 'success'; response: SagaPageResponse }
  | { status: 'error'; message: string };

function listError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'No se pudo cargar la lista con estos parámetros';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar las sagas';
  }
  return 'No se pudieron cargar las sagas';
}

@Component({
  selector: 'app-sagas-list',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    ReactiveFormsModule,
    RouterLink,
    EmptyState,
    InlineFeedback,
    LoadingState,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: spanishSagaPaginator }],
  templateUrl: './sagas-list.html',
  styleUrl: './sagas-list.scss',
})
export class SagasList {
  private readonly service = inject(SagasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly state = signal<ListState>({ status: 'loading' });
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly totalElements = signal(0);
  readonly appliedName = signal('');
  readonly failedImages = signal<ReadonlySet<number>>(new Set());
  readonly pageSizeOptions = [10, 20, 50, 100];
  readonly hasSearch = computed(() => this.appliedName().length > 0);
  readonly isEmpty = computed(() => {
    const state = this.state();
    return state.status === 'success' && state.response.totalElements === 0 && !this.hasSearch();
  });
  readonly noResults = computed(() => {
    const state = this.state();
    return state.status === 'success' && state.response.totalElements === 0 && this.hasSearch();
  });
  readonly announcement = computed(() => {
    const state = this.state();
    if (state.status !== 'success' || state.response.totalElements === 0) return '';
    return `Mostrando ${state.response.content.length} de ${state.response.totalElements} sagas`;
  });
  readonly searchForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });
  protected readonly readingPercent = readingPercent;
  private requestGeneration = 0;

  constructor() {
    this.load();
  }

  submitSearch(): void {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      this.element.nativeElement
        .querySelector<HTMLInputElement>('[formControlName="name"]')
        ?.focus();
      return;
    }
    const name = this.searchForm.controls.name.value.trim();
    const changed = name !== this.appliedName() || this.pageIndex() !== 0;
    this.appliedName.set(name);
    this.pageIndex.set(0);
    if (changed) this.load();
  }

  clearSearch(): void {
    this.searchForm.reset();
    if (this.appliedName() === '') return;
    this.appliedName.set('');
    this.pageIndex.set(0);
    this.load();
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

  imageFailed(id: number): boolean {
    return this.failedImages().has(id);
  }

  markImageFailed(id: number): void {
    this.failedImages.update((failed) => new Set(failed).add(id));
  }

  private load(): void {
    const generation = ++this.requestGeneration;
    this.state.set({ status: 'loading' });
    this.service
      .getSagas({
        page: this.pageIndex(),
        size: this.pageSize(),
        sortBy: 'name',
        direction: 'ASC',
        name: this.appliedName(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (generation !== this.requestGeneration) return;
          this.totalElements.set(response.totalElements);
          this.state.set({ status: 'success', response });
        },
        error: (error: unknown) => {
          if (generation !== this.requestGeneration) return;
          this.state.set({ status: 'error', message: listError(error) });
        },
      });
  }
}

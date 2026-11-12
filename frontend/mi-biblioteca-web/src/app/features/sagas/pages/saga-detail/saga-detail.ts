import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, map, of, startWith, Subject, switchMap } from 'rxjs';
import { FeedbackService } from '../../../../core/ui/feedback/feedback.service';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import {
  SagaDeleteDialog,
  SagaDeleteDialogData,
} from '../../components/saga-delete-dialog/saga-delete-dialog';
import { sagaDeleteDialogConfig } from '../../components/saga-delete-dialog/saga-delete-dialog.helpers';
import { problemCode, sagaDeleteError, sagaLoadError } from '../../models/saga-error';
import { parseSagaId } from '../../models/saga-id';
import { collectionPercent, readingPercent } from '../../models/saga-progress';
import { SagaResponse } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

type DetailState =
  | { status: 'loading' }
  | { status: 'loaded'; saga: SagaResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-saga-detail',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink, InlineFeedback, LoadingState],
  templateUrl: './saga-detail.html',
  styleUrl: './saga-detail.scss',
})
export class SagaDetail {
  private readonly service = inject(SagasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(FeedbackService);
  private readonly loadId = new Subject<number>();
  private confirmation: MatDialogRef<SagaDeleteDialog, boolean> | null = null;
  readonly currentId = signal<number | null>(null);
  readonly state = signal<DetailState>({ status: 'loading' });
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly imageFailed = signal(false);
  readonly busy = computed(() => this.deleting() || this.state().status === 'loading');
  protected readonly collectionPercent = collectionPercent;
  protected readonly readingPercent = readingPercent;

  constructor() {
    this.loadId
      .pipe(
        switchMap((id) => {
          if (!id) {
            return of<DetailState>({
              status: 'error',
              message: 'El identificador de la saga no es válido',
            });
          }
          return this.service.getSaga(id).pipe(
            map((saga): DetailState => ({ status: 'loaded', saga })),
            catchError((error: unknown) =>
              of<DetailState>({ status: 'error', message: sagaLoadError(error) }),
            ),
            startWith<DetailState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));

    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rawId) => {
        const id = parseSagaId(rawId);
        this.currentId.set(id);
        this.deleteError.set(null);
        this.imageFailed.set(false);
        this.loadId.next(id ?? 0);
      });

    this.destroyRef.onDestroy(() => this.confirmation?.close(false));
  }

  retry(): void {
    const id = this.currentId();
    if (!id) return;
    this.deleteError.set(null);
    this.loadId.next(id);
  }

  openDeleteDialog(): void {
    const current = this.state();
    if (current.status !== 'loaded' || this.deleting() || this.confirmation) return;
    const saga = current.saga;
    const ref = this.dialog.open<SagaDeleteDialog, SagaDeleteDialogData, boolean>(
      SagaDeleteDialog,
      sagaDeleteDialogConfig(saga.name),
    );
    this.confirmation = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.confirmation !== ref) return;
        this.confirmation = null;
        if (confirmed && !this.deleting()) this.delete(saga);
      });
  }

  private delete(saga: SagaResponse): void {
    if (this.deleting()) return;
    this.deleteError.set(null);
    this.deleting.set(true);
    this.service
      .deleteSaga(saga.id, saga.revision)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.feedback.success('Saga eliminada.');
          void this.router.navigate(['/sagas']);
        },
        error: (error: unknown) => {
          this.deleteError.set(sagaDeleteError(error));
          if (
            error instanceof HttpErrorResponse &&
            problemCode(error.error) === 'SAGA_REVISION_CONFLICT'
          ) {
            this.reload();
          }
        },
      });
  }

  private reload(): void {
    const id = this.currentId();
    if (id) this.loadId.next(id);
  }
}

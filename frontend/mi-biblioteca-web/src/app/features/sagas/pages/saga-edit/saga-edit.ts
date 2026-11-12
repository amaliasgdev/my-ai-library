import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, map, of, startWith, Subject, switchMap } from 'rxjs';
import { FeedbackService } from '../../../../core/ui/feedback/feedback.service';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { LoadingState } from '../../../../core/ui/feedback/loading-state';
import { SagaForm } from '../../components/saga-form/saga-form';
import { problemCode, sagaLoadError, sagaSaveError } from '../../models/saga-error';
import { parseSagaId } from '../../models/saga-id';
import { SagaRequest, SagaResponse } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

type EditState =
  | { status: 'loading' }
  | { status: 'loaded'; saga: SagaResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-saga-edit',
  imports: [SagaForm, InlineFeedback, LoadingState],
  templateUrl: './saga-edit.html',
  styleUrl: './saga-edit.scss',
})
export class SagaEdit {
  private readonly service = inject(SagasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  private readonly loadId = new Subject<number>();
  readonly editor = viewChild.required(SagaForm);
  readonly currentId = signal<number | null>(null);
  readonly state = signal<EditState>({ status: 'loading' });
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);

  constructor() {
    this.loadId
      .pipe(
        switchMap((id) => {
          if (!id) {
            return of<EditState>({
              status: 'error',
              message: 'El identificador de la saga no es válido',
            });
          }
          return this.service.getSaga(id).pipe(
            map((saga): EditState => ({ status: 'loaded', saga })),
            catchError((error: unknown) =>
              of<EditState>({ status: 'error', message: sagaLoadError(error) }),
            ),
            startWith<EditState>({ status: 'loading' }),
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
        this.generalError.set(null);
        this.loadId.next(id ?? 0);
      });
  }

  retry(): void {
    const id = this.currentId();
    if (!id) return;
    this.generalError.set(null);
    this.loadId.next(id);
  }

  save(request: SagaRequest): void {
    const current = this.state();
    if (this.submitting() || current.status !== 'loaded') return;
    this.generalError.set(null);
    this.submitting.set(true);
    this.service
      .updateSaga(current.saga.id, request, current.saga.revision)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (saga) => {
          this.feedback.success('Saga actualizada.');
          void this.router.navigate(['/sagas', saga.id]);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            if (error.status === 400) {
              this.editor().applyFieldErrors(error.error);
              this.generalError.set('Revisa los campos indicados');
              return;
            }
            if (error.status === 409) {
              const code = problemCode(error.error);
              if (code === 'SAGA_NAME_CONFLICT') {
                this.editor().markNameConflict();
                this.generalError.set('Ya existe una saga con ese nombre y autor');
              } else if (code === 'SAGA_REVISION_CONFLICT') {
                this.reload();
                this.generalError.set(
                  'La saga ha cambiado. Se ha actualizado la información; revisa y vuelve a guardar.',
                );
              } else {
                this.generalError.set('No se pudo guardar la saga por un conflicto de datos');
              }
              return;
            }
          }
          this.generalError.set(sagaSaveError(error));
        },
      });
  }

  cancel(): void {
    if (this.submitting()) return;
    const current = this.state();
    if (current.status === 'loaded') void this.router.navigate(['/sagas', current.saga.id]);
    else void this.router.navigate(['/sagas']);
  }

  private reload(): void {
    const id = this.currentId();
    if (id) this.loadId.next(id);
  }
}

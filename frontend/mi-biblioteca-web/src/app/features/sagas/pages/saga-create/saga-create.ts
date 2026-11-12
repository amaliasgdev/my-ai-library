import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { FeedbackService } from '../../../../core/ui/feedback/feedback.service';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { SagaForm } from '../../components/saga-form/saga-form';
import { problemCode, sagaSaveError } from '../../models/saga-error';
import { SagaRequest } from '../../models/saga.models';
import { SagasService } from '../../services/sagas.service';

@Component({
  selector: 'app-saga-create',
  imports: [SagaForm, InlineFeedback],
  templateUrl: './saga-create.html',
  styleUrl: './saga-create.scss',
})
export class SagaCreate {
  private readonly service = inject(SagasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(FeedbackService);
  readonly editor = viewChild.required(SagaForm);
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);

  save(request: SagaRequest): void {
    if (this.submitting()) return;
    this.generalError.set(null);
    this.submitting.set(true);
    this.service
      .createSaga(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (saga) => {
          this.feedback.success('Saga creada.');
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
              if (problemCode(error.error) === 'SAGA_NAME_CONFLICT') {
                this.editor().markNameConflict();
                this.generalError.set('Ya existe una saga con ese nombre y autor');
              } else {
                this.generalError.set('No se pudo crear la saga por un conflicto de datos');
              }
              return;
            }
          }
          this.generalError.set(sagaSaveError(error));
        },
      });
  }

  cancel(): void {
    if (!this.submitting()) void this.router.navigate(['/sagas']);
  }
}

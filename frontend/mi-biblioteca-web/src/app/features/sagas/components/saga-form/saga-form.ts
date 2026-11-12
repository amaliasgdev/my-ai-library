import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnChanges,
  output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';
import { SagaRequest, SagaResponse } from '../../models/saga.models';
import { createSagaForm } from './saga-form.factory';
import { buildSagaRequest, SagaFormValue, sagaFormValue } from './saga-form.helpers';

@Component({
  selector: 'app-saga-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    InlineFeedback,
  ],
  templateUrl: './saga-form.html',
  styleUrl: './saga-form.scss',
})
export class SagaForm implements OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly initialSaga = input<SagaResponse | null>(null);
  readonly submitting = input(false);
  readonly saveLabel = input('Guardar');
  readonly submissionMessage = input('Guardando saga…');
  readonly save = output<SagaRequest>();
  readonly cancelled = output<void>();
  readonly form = createSagaForm();

  constructor() {
    for (const control of Object.values(this.form.controls)) {
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.clearServerError(control);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const saga = this.initialSaga();
    if (changes['initialSaga'] && saga) {
      this.form.reset(sagaFormValue(saga));
    }
  }

  submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    this.save.emit(buildSagaRequest(this.form.getRawValue() as SagaFormValue));
  }

  cancel(): void {
    if (!this.submitting()) this.cancelled.emit();
  }

  fieldError(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) return '';
    if (errors['required']) return 'El nombre es obligatorio';
    if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
    if (errors['imageUrl'])
      return 'Introduce una URL HTTP/HTTPS válida, sin espacios ni credenciales';
    if (errors['server'])
      return typeof errors['server'] === 'string' ? errors['server'] : 'Revisa este valor';
    return 'Revisa este valor';
  }

  markNameConflict(): void {
    this.setServerError(this.form.controls.name, 'Ya existe una saga con ese nombre y autor');
  }

  applyFieldErrors(problem: unknown): void {
    if (!problem || typeof problem !== 'object' || !('errors' in problem)) return;
    const errors = problem.errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return;
    for (const field of Object.keys(errors)) {
      if (!Object.hasOwn(this.form.controls, field)) continue;
      this.setServerError(this.form.get(field)!);
    }
  }

  private focusFirstInvalid(): void {
    const firstInvalid = (['name', 'author', 'description', 'imageUrl'] as const).find(
      (field) => this.form.controls[field].invalid,
    );
    if (!firstInvalid) return;
    this.element.nativeElement
      .querySelector<HTMLElement>(`[formControlName="${firstInvalid}"]`)
      ?.focus();
  }

  private setServerError(control: AbstractControl, message?: string): void {
    control.setErrors({
      ...control.errors,
      server: message ?? true,
    });
    control.markAsTouched();
  }

  private clearServerError(control: AbstractControl): void {
    if (!control.hasError('server')) return;
    const errors = { ...control.errors };
    delete errors['server'];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }
}

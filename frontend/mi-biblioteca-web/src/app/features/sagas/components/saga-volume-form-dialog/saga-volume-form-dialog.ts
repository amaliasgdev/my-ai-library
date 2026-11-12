import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { notBlank } from '../saga-form/saga-form.validators';
import { SagaVolume } from '../../models/saga.models';

export type SagaVolumeFormMode = 'add-pending' | 'edit';

export interface SagaVolumeFormDialogData {
  mode: SagaVolumeFormMode;
  volume?: SagaVolume;
}

export interface SagaVolumeFormDialogResult {
  pendingTitle: string | null;
  volumeLabel: string | null;
}

@Component({
  selector: 'app-saga-volume-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './saga-volume-form-dialog.html',
  styleUrl: './saga-volume-form-dialog.scss',
})
export class SagaVolumeFormDialog {
  readonly data = inject<SagaVolumeFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<SagaVolumeFormDialog, SagaVolumeFormDialogResult>>(MatDialogRef);
  readonly isPending =
    this.data.mode === 'add-pending' ||
    (this.data.volume != null && this.data.volume.book === null);
  readonly form = new FormGroup({
    pendingTitle: new FormControl(this.data.volume?.pendingTitle ?? '', {
      nonNullable: true,
      validators: this.isPending
        ? [notBlank, Validators.maxLength(255)]
        : [Validators.maxLength(255)],
    }),
    volumeLabel: new FormControl(this.data.volume?.volumeLabel ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(40)],
    }),
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const selector = this.form.controls.pendingTitle.invalid
        ? '[formControlName="pendingTitle"]'
        : '[formControlName="volumeLabel"]';
      document.querySelector<HTMLElement>(selector)?.focus();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      pendingTitle: this.isPending ? value.pendingTitle.trim() : null,
      volumeLabel: value.volumeLabel.trim() || null,
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  fieldError(control: AbstractControl): string {
    if (control.hasError('required')) return 'Este campo no puede estar vacío';
    if (control.hasError('maxlength'))
      return `Máximo ${control.errors?.['maxlength'].requiredLength} caracteres`;
    return 'Revisa este valor';
  }
}

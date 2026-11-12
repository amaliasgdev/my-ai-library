import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export type SagaVolumeConfirmMode = 'remove' | 'unlink';

export interface SagaVolumeConfirmDialogData {
  mode: SagaVolumeConfirmMode;
  volumeTitle: string;
}

@Component({
  selector: 'app-saga-volume-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './saga-volume-confirm-dialog.html',
  styleUrl: './saga-volume-confirm-dialog.scss',
})
export class SagaVolumeConfirmDialog {
  readonly data = inject<SagaVolumeConfirmDialogData>(MAT_DIALOG_DATA);
}

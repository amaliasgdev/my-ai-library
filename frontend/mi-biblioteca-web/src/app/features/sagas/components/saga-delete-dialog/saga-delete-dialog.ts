import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface SagaDeleteDialogData {
  name: string;
}

@Component({
  selector: 'app-saga-delete-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './saga-delete-dialog.html',
  styleUrl: './saga-delete-dialog.scss',
})
export class SagaDeleteDialog {
  readonly data = inject<SagaDeleteDialogData>(MAT_DIALOG_DATA);
}

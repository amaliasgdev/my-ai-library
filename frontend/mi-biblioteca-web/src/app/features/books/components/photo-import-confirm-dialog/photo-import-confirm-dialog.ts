import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface PhotoImportConfirmation {
  heading: string;
  message: string;
  titles: string[];
}
@Component({
  selector: 'app-photo-import-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.heading }}</h2>
    <mat-dialog-content
      ><p>{{ data.message }}</p>
      <ul>
        @for (title of data.titles; track $index) {
          <li>{{ title }}</li>
        }
      </ul></mat-dialog-content
    >
    <mat-dialog-actions align="end"
      ><button mat-button [mat-dialog-close]="false" cdkFocusInitial>Cancelar</button
      ><button mat-flat-button [mat-dialog-close]="true">Confirmar</button></mat-dialog-actions
    >
  `,
})
export class PhotoImportConfirmDialog {
  readonly data = inject<PhotoImportConfirmation>(MAT_DIALOG_DATA);
}

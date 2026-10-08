import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface BookDeleteDialogData {
  title: string;
}

@Component({
  selector: 'app-book-delete-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './book-delete-dialog.html',
  styleUrl: './book-delete-dialog.scss',
})
export class BookDeleteDialog {
  readonly data = inject<BookDeleteDialogData>(MAT_DIALOG_DATA);
}

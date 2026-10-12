import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogConfig } from '@angular/material/dialog';
import { BookDeleteDialogData } from './book-delete-dialog';

export function bookDeleteDialogConfig(title: string): MatDialogConfig<BookDeleteDialogData> {
  return {
    data: { title },
    autoFocus: '.cancel-delete',
    restoreFocus: true,
    ariaDescribedBy: 'book-delete-description',
    width: '28rem',
    maxWidth: 'calc(100vw - 2rem)',
  };
}

export function bookDeleteError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) return 'El libro ya no existe';
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo eliminar el libro';
  }
  return 'No se pudo eliminar el libro';
}

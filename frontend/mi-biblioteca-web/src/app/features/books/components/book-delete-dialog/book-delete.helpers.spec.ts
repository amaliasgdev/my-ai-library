import { HttpErrorResponse } from '@angular/common/http';
import { bookDeleteDialogConfig, bookDeleteError } from './book-delete.helpers';
describe('book delete helpers', () => {
  it('configures the accessible dialog with initial cancel focus', () =>
    expect(bookDeleteDialogConfig('Title')).toEqual({
      data: { title: 'Title' },
      autoFocus: '.cancel-delete',
      restoreFocus: true,
      ariaDescribedBy: 'book-delete-description',
      width: '28rem',
      maxWidth: 'calc(100vw - 2rem)',
    }));
  it.each([
    [404, 'El libro ya no existe'],
    [0, 'No se puede conectar con el servidor'],
    [500, 'El servidor no pudo eliminar el libro'],
    [503, 'El servidor no pudo eliminar el libro'],
    [409, 'No se pudo eliminar el libro'],
  ])('maps status %s safely', (status, message) =>
    expect(bookDeleteError(new HttpErrorResponse({ status, error: { detail: 'PRIVATE' } }))).toBe(
      message,
    ),
  );
  it('handles unknown errors safely', () =>
    expect(bookDeleteError(new Error('PRIVATE'))).toBe('No se pudo eliminar el libro'));
});

import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  it('opens polite transient snackbars for success and information', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: { open } }],
    });
    const service = TestBed.inject(FeedbackService);
    service.success(' Libro creado. ');
    service.info('Importación completada.');
    expect(open).toHaveBeenNthCalledWith(1, 'Libro creado.', 'Cerrar', {
      duration: 4500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      politeness: 'polite',
    });
    expect(open).toHaveBeenNthCalledWith(2, 'Importación completada.', 'Cerrar', {
      duration: 4500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      politeness: 'polite',
    });
  });

  it('ignores blank messages', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: { open } }],
    });
    TestBed.inject(FeedbackService).success('   ');
    expect(open).not.toHaveBeenCalled();
  });
});

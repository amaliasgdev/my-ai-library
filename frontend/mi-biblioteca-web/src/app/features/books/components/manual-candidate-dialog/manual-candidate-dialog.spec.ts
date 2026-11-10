import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ManualCandidateDialog } from './manual-candidate-dialog';

describe('ManualCandidateDialog', () => {
  let fixture: ComponentFixture<ManualCandidateDialog>;
  let element: HTMLElement;
  const close = vi.fn();

  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({
      imports: [ManualCandidateDialog],
      providers: [{ provide: MatDialogRef, useValue: { close } }],
    });
    fixture = TestBed.createComponent(ManualCandidateDialog);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  const button = (text: string) =>
    Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text),
    ) as HTMLButtonElement;
  const fill = (title: string, author: string, isbn = '') => {
    fixture.componentInstance.form.setValue({ title, author, isbn });
    fixture.detectChanges();
  };

  it('asks only for title, author and an optional ISBN, with both actions and no genre field', () => {
    const labels = Array.from(element.querySelectorAll('mat-label')).map((l) => l.textContent);
    expect(labels).toEqual(['Título', 'Autor', 'ISBN (opcional)']);
    expect(element.textContent).not.toContain('éner');
    expect(button('Añadir y buscar coincidencias')).toBeTruthy();
    expect(button('Añadir sin buscar')).toBeTruthy();
    expect(button('Cancelar')).toBeTruthy();
  });

  it('keeps the dialog open and shows errors when title or author is missing', () => {
    button('Añadir sin buscar').click();
    button('Añadir y buscar coincidencias').click();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Indica el título');
    expect(element.textContent).toContain('Indica el autor');
    fill('   ', 'Author');
    button('Añadir sin buscar').click();
    expect(close).not.toHaveBeenCalled();
  });

  it('adds without searching, trimming text and allowing an empty ISBN', () => {
    fill('  Dune ', ' Frank Herbert  ');
    button('Añadir sin buscar').click();
    expect(close).toHaveBeenCalledWith({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '',
      search: false,
    });
  });

  it('adds and searches from the primary action and from native form submit', () => {
    fill('Dune', 'Frank Herbert', ' 0132350882 ');
    button('Añadir y buscar coincidencias').click();
    expect(close).toHaveBeenLastCalledWith({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '0132350882',
      search: true,
    });
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(close).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenLastCalledWith(expect.objectContaining({ search: true }));
  });

  it('rejects multiline or overlong values without repairing them', () => {
    fill('Dune\nII', 'Author');
    expect(fixture.componentInstance.form.controls.title.hasError('pattern')).toBe(true);
    fill('a'.repeat(256), 'Author');
    expect(fixture.componentInstance.form.controls.title.hasError('maxlength')).toBe(true);
    fill('Dune', 'Author', 'x'.repeat(51));
    expect(fixture.componentInstance.form.controls.isbn.hasError('maxlength')).toBe(true);
    button('Añadir sin buscar').click();
    expect(close).not.toHaveBeenCalled();
  });

  it('cancels without a result', () => {
    fill('Dune', 'Frank Herbert');
    button('Cancelar').click();
    expect(close).toHaveBeenCalledWith();
  });
});

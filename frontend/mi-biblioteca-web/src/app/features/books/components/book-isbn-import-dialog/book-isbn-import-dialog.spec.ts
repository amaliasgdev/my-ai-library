import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { BookIsbnImportDialog } from './book-isbn-import-dialog';

@Component({ template: '<button id="manual-trigger" (click)="open()">Introducir ISBN</button>' })
class Host {
  private readonly dialog = inject(MatDialog);
  open(): void {
    this.dialog.open(BookIsbnImportDialog, { autoFocus: 'input', restoreFocus: true });
  }
}

describe('BookIsbnImportDialog without HTTP or routing providers', () => {
  let fixture: ComponentFixture<Host>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: {
            ...new MatDialogConfig(),
            enterAnimationDuration: 0,
            exitAnimationDuration: 0,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    fixture.destroy();
  });
  async function open() {
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '#manual-trigger',
    )!;
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    return TestBed.inject(MatDialog).openDialogs[0];
  }
  function button(text: string): HTMLButtonElement {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
      (item) => item.textContent?.trim() === text,
    )!;
  }
  function input(value: string): HTMLInputElement {
    const field = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return field;
  }
  it('renders title, label, help, buttons and focuses ISBN', async () => {
    await open();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Introducir ISBN');
    expect(dialog.textContent).toContain('ISBN-13; puedes usar espacios o guiones');
    expect(dialog.querySelector('mat-label')?.textContent).toBe('ISBN');
    await vi.waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('input')));
    expect(button('Cancelar').type).toBe('button');
    expect(button('Continuar').type).toBe('submit');
  });
  it('Cancel returns no ISBN and restores focus', async () => {
    const ref = await open();
    const done = firstValueFrom(ref.afterClosed());
    button('Cancelar').click();
    expect(await done).toBeUndefined();
    expect(document.activeElement?.id).toBe('manual-trigger');
  });
  it.each(['Escape', 'backdrop'])('%s cancels with no result', async (action) => {
    const ref = await open();
    const done = firstValueFrom(ref.afterClosed());
    if (action === 'Escape')
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    else (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    expect(await done).toBeUndefined();
  });
  it('Continue returns only the canonical ISBN and guards repeated submit', async () => {
    const ref = await open();
    input('978-0 306-40615-7');
    const close = vi.spyOn(ref, 'close');
    const done = firstValueFrom(ref.afterClosed());
    button('Continuar').click();
    (ref.componentInstance as BookIsbnImportDialog).submit();
    expect(await done).toBe('9780306406157');
    expect(close).toHaveBeenCalledExactlyOnceWith('9780306406157');
  });
  it('invalid checksum marks touched and shows error without closing', async () => {
    const ref = await open();
    input('9780306406158');
    button('Continuar').click();
    await fixture.whenStable();
    expect((ref.componentInstance as BookIsbnImportDialog).form.controls.isbn.touched).toBe(true);
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
    expect(document.querySelector('mat-error')?.textContent).toContain(
      'Introduce un ISBN-13 válido con dígito de control correcto',
    );
    input('9780306406157');
    await fixture.whenStable();
    expect((ref.componentInstance as BookIsbnImportDialog).form.valid).toBe(true);
  });
  // jsdom does not synthesize the browser's implicit Enter submission: dispatch its native submit event.
  it('Enter/native form submission shares Continue submit and returns one result', async () => {
    const ref = await open();
    const field = input('978 0306406157');
    const done = firstValueFrom(ref.afterClosed());
    const close = vi.spyOn(ref, 'close');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(await done).toBe('9780306406157');
    expect(close).toHaveBeenCalledOnce();
  });
  it('invalid Enter/native submit does not close', async () => {
    const ref = await open();
    const field = input('0306406152');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect((ref.componentInstance as BookIsbnImportDialog).form.controls.isbn.touched).toBe(true);
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { BookDeleteDialog } from './book-delete-dialog';

@Component({ template: '<button type="button">Opener</button>' })
class DialogHost {}

describe('BookDeleteDialog', () => {
  async function openDialog() {
    TestBed.configureTestingModule({ imports: [DialogHost] });
    const fixture = TestBed.createComponent(DialogHost);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    opener.focus();
    const ref = TestBed.inject(MatDialog).open<BookDeleteDialog, { title: string }, boolean>(
      BookDeleteDialog,
      {
        data: { title: 'Dune' },
        autoFocus: '.cancel-delete',
        restoreFocus: true,
        ariaDescribedBy: 'book-delete-description',
        enterAnimationDuration: 0,
        exitAnimationDuration: 0,
      },
    );
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Cancelar'));
    return { fixture, ref, closed, loader, dialog, opener };
  }

  it('should display a specific accessible warning and focus Cancelar first', async () => {
    const { dialog, ref, fixture } = await openDialog();
    expect(await dialog.getText()).toContain('Eliminar libro');
    expect(await dialog.getText()).toContain('¿Seguro que quieres eliminar «Dune»?');
    expect(await dialog.getText()).toContain('Esta acción no se puede deshacer.');
    expect(document.activeElement?.textContent?.trim()).toBe('Cancelar');
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-describedby')).toBe(
      'book-delete-description',
    );
    ref.close(false);
    await fixture.whenStable();
  });

  it('should return false on Cancelar and restore the opener focus', async () => {
    const { loader, fixture, closed, opener } = await openDialog();
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Cancelar' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(closed).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(opener);
  });

  it('should return explicit true only from Eliminar', async () => {
    const { loader, fixture, closed } = await openDialog();
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Eliminar' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(closed).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('should treat Escape as cancellation', async () => {
    const { dialog, fixture, closed } = await openDialog();
    await dialog.close();
    await fixture.whenStable();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(closed).toHaveBeenCalledWith(undefined);
    expect(closed).not.toHaveBeenCalledWith(true);
  });

  it('should treat backdrop clicks as cancellation', async () => {
    const { fixture, closed } = await openDialog();
    (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(closed).toHaveBeenCalledWith(undefined);
    expect(closed).not.toHaveBeenCalledWith(true);
  });
});

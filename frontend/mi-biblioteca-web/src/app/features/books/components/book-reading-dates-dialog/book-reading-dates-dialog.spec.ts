import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DateAdapter } from '@angular/material/core';
import { BookReadingDatesDialog, ReadingDatesAdapter } from './book-reading-dates-dialog';
import { testBook } from '../../models/book.testing';
import { parseLocalDate } from '../../models/reading-date';

describe('BookReadingDatesDialog', () => {
  let fixture: ComponentFixture<BookReadingDatesDialog>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookReadingDatesDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: testBook({ startedOn: '2024-02-29', finishedOn: null }),
        },
      ],
    });
    fixture = TestBed.createComponent(BookReadingDatesDialog);
    fixture.detectChanges();
  });
  async function inputs() {
    return TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatInputHarness);
  }
  async function button(text: string) {
    return TestbedHarnessEnvironment.loader(fixture).getHarness(MatButtonHarness.with({ text }));
  }
  function setDates(start: string | null, end: string | null) {
    fixture.componentInstance.form.setValue({
      startedOn: start ? parseLocalDate(start) : null,
      finishedOn: end ? parseLocalDate(end) : null,
    });
    fixture.detectChanges();
  }

  it('should preload local calendar dates and null as an empty input', async () => {
    const [start, end] = await inputs();
    expect(await start.getValue()).toBe('2024-02-29');
    expect(await end.getValue()).toBe('');
    expect(fixture.componentInstance.form.pristine).toBe(true);
    expect(fixture.componentInstance.form.untouched).toBe(true);
  });

  it.each([
    ['2024-02-29', null],
    [null, '2026-10-12'],
    ['2026-10-12', '2026-10-12'],
    ['2099-01-01', '2099-12-31'],
  ])('should accept optional dates, equal dates and future dates: %s/%s', (start, end) => {
    setDates(start, end);
    expect(fixture.componentInstance.form.valid).toBe(true);
    const requested = vi.fn();
    fixture.componentInstance.saveRequested.subscribe(requested);
    fixture.componentInstance.save();
    expect(requested).toHaveBeenCalledExactlyOnceWith({ startedOn: start, finishedOn: end });
  });

  it.each(['2023-02-29', '2024-02-30', 'nonsense', '2026-13-10'])(
    'should reject typed invalid date %s without normalizing it',
    async (value) => {
      const [start] = await inputs();
      await start.setValue(value);
      expect(fixture.componentInstance.form.controls.startedOn.invalid).toBe(true);
      expect(await (await button('Guardar')).isDisabled()).toBe(true);
      const requested = vi.fn();
      fixture.componentInstance.saveRequested.subscribe(requested);
      fixture.componentInstance.save();
      expect(requested).not.toHaveBeenCalled();
    },
  );

  it('should accept a typed leap day and submit the same calendar day', async () => {
    const [start, end] = await inputs();
    await start.setValue('2024-02-29');
    await end.setValue('2024-03-01');
    const requested = vi.fn();
    fixture.componentInstance.saveRequested.subscribe(requested);
    await (await button('Guardar')).click();
    expect(requested).toHaveBeenCalledExactlyOnceWith({
      startedOn: '2024-02-29',
      finishedOn: '2024-03-01',
    });
  });

  it('should reject an end before the start', () => {
    setDates('2026-10-12', '2026-10-11');
    expect(fixture.componentInstance.form.hasError('dateOrder')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('no puede ser anterior');
  });

  it('should reject empty PUT and explain the separate deletion action', async () => {
    setDates(null, null);
    expect(await (await button('Guardar')).isDisabled()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Para borrar ambas fechas, usa Eliminar fechas',
    );
  });

  it('should emit deletion and cancellation without HTTP or modifying initial data', async () => {
    const remove = vi.fn();
    const cancel = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(remove);
    fixture.componentInstance.cancelRequested.subscribe(cancel);
    await (await button('Eliminar fechas')).click();
    await (await button('Cancelar')).click();
    expect(remove).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.book.startedOn).toBe('2024-02-29');
  });

  it('should block controls and all actions while pending, including code guards', async () => {
    const requested = vi.fn();
    fixture.componentInstance.saveRequested.subscribe(requested);
    fixture.componentInstance.deleteRequested.subscribe(requested);
    fixture.componentInstance.cancelRequested.subscribe(requested);
    fixture.componentInstance.setPending(true);
    fixture.detectChanges();
    for (const input of await inputs()) expect(await input.isDisabled()).toBe(true);
    for (const text of ['Guardar', 'Eliminar fechas', 'Cancelar'])
      expect(await (await button(text)).isDisabled()).toBe(true);
    fixture.componentInstance.save();
    fixture.componentInstance.remove();
    fixture.componentInstance.cancel();
    expect(requested).not.toHaveBeenCalled();
    fixture.componentInstance.setPending(false);
    fixture.detectChanges();
    expect(await (await button('Guardar')).isDisabled()).toBe(false);
  });

  it('should show an inline error without losing edited values', async () => {
    setDates('2026-10-12', null);
    fixture.componentInstance.error.set('No se pudieron actualizar las fechas de lectura');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('No se pudieron actualizar');
    expect(await (await inputs())[0].getValue()).toBe('2026-10-12');
  });

  it('should use a strict local native adapter, never a UTC string constructor', () => {
    const instance = fixture.debugElement.injector.get(DateAdapter) as ReadingDatesAdapter;
    const date = instance.parse('2024-02-29')!;
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
    expect(instance.format(date, 'iso')).toBe('2024-02-29');
    expect(instance.parse('2024-02-30')?.getTime()).toBeNaN();
  });
});

describe('BookReadingDatesDialog without confirmed dates', () => {
  it('should disable deletion and reject empty save', async () => {
    TestBed.configureTestingModule({
      imports: [BookReadingDatesDialog],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: testBook() }],
    });
    const fixture = TestBed.createComponent(BookReadingDatesDialog);
    fixture.detectChanges();
    const remove = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(remove);
    fixture.componentInstance.remove();
    expect(remove).not.toHaveBeenCalled();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    expect(
      await (
        await loader.getHarness(MatButtonHarness.with({ text: 'Eliminar fechas' }))
      ).isDisabled(),
    ).toBe(true);
    expect(
      await (await loader.getHarness(MatButtonHarness.with({ text: 'Guardar' }))).isDisabled(),
    ).toBe(true);
  });
});

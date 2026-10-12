import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { ReadingStatus } from '../../models/book.models';
import { testBook } from '../../models/book.testing';
import { BookCard } from './book-card';
import { provideRouter } from '@angular/router';

describe('BookCard', () => {
  let fixture: ComponentFixture<BookCard>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BookCard], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(BookCard);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('book', testBook());
    fixture.detectChanges();
  });

  it('should render title, author and accessible edit/delete actions without extra metadata', async () => {
    fixture.componentRef.setInput(
      'book',
      testBook({
        isbn: '9780132350884',
        description: 'Hidden description',
        publisher: 'Hidden publisher',
        publicationYear: 2008,
        genres: ['Hidden genre'],
      }),
    );
    fixture.detectChanges();
    const card = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatCardHarness);
    expect(await card.getTitleText()).toBe('Libro de prueba');
    expect(await card.getSubtitleText()).toBe('Autora de prueba');
    expect(element.querySelector('h2')?.textContent).toBe('Libro de prueba');
    const link = element.querySelector('a');
    expect(link?.textContent?.trim()).toBe('Editar');
    expect(link?.getAttribute('href')).toBe('/books/1/edit');
    expect(link?.getAttribute('aria-label')).toBe('Editar Libro de prueba');
    const deletion = element.querySelector('mat-card-actions button');
    expect(deletion?.textContent?.trim()).toBe('Eliminar');
    expect(deletion?.getAttribute('aria-label')).toBe('Eliminar Libro de prueba');
    expect(element.querySelectorAll('mat-card-actions a, mat-card-actions button')).toHaveLength(2);
    expect(element.textContent).not.toMatch(/Hidden|9780132350884|2008/);
  });

  it('should emit the book to its parent without HTTP or a dialog', () => {
    const requested = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(requested);
    (element.querySelector('mat-card-actions button') as HTMLButtonElement).click();
    expect(requested).toHaveBeenCalledExactlyOnceWith(testBook());
  });

  it('should disable only deletion for other cards during an active delete', () => {
    fixture.componentRef.setInput('deleteDisabled', true);
    fixture.detectChanges();
    const requested = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(requested);
    expect((element.querySelector('mat-card-actions button') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/1/edit');
    fixture.componentInstance.requestDelete();
    expect(requested).not.toHaveBeenCalled();
  });

  it('should block edit and delete and announce progress for the affected book', () => {
    fixture.componentRef.setInput('deleting', true);
    fixture.detectChanges();
    expect((element.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('aria-disabled')).toBe('true');
    expect(element.querySelector('mat-card-actions [role="status"]')?.textContent).toBe(
      'Eliminando…',
    );
    const requested = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(requested);
    fixture.componentInstance.requestDelete();
    expect(requested).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.test/cover.jpg',
    'http://localhost:8081/api/covers/1-12345678-1234-1234-1234-123456789abc.png',
  ])('should use the cover URL unchanged: %s', (coverUrl) => {
    fixture.componentRef.setInput('book', testBook({ coverUrl }));
    fixture.detectChanges();
    const image = element.querySelector('img');
    expect(image?.getAttribute('src')).toBe(coverUrl);
    expect(image?.getAttribute('alt')).toBe('Portada de Libro de prueba');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(element.querySelector('.cover-fallback')).toBeNull();
  });

  it('should show Sin portada when coverUrl is null', () => {
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.cover-fallback')?.textContent).toBe('Sin portada');
  });

  it('should replace a failed image with the fallback', () => {
    fixture.componentRef.setInput(
      'book',
      testBook({ coverUrl: 'https://example.test/broken.jpg' }),
    );
    fixture.detectChanges();
    element.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('Sin portada');
  });

  it('should recover after changing coverUrl and preserve failure for the same URL', () => {
    const coverUrl = 'https://example.test/broken.jpg';
    fixture.componentRef.setInput('book', testBook({ coverUrl }));
    fixture.detectChanges();
    element.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.componentRef.setInput('book', testBook({ coverUrl, title: 'Updated title' }));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('book', testBook({ coverUrl: 'https://example.test/new.png' }));
    fixture.detectChanges();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://example.test/new.png');
    expect(element.querySelector('.cover-fallback')).toBeNull();
  });

  it.each<[ReadingStatus, string]>([
    ['TO_READ', 'Por leer'],
    ['READING', 'Leyendo'],
    ['READ', 'Leído'],
    ['ABANDONED', 'Abandonado'],
  ])('should label %s as %s', (readingStatus, label) => {
    fixture.componentRef.setInput('book', testBook({ readingStatus }));
    fixture.detectChanges();
    expect(element.querySelector('.reading-status')?.textContent).toBe(label);
  });

  it('should show a noninteractive accessible rating when present', () => {
    fixture.componentRef.setInput('book', testBook({ rating: 4 }));
    fixture.detectChanges();
    expect(element.querySelector('.rating')?.textContent).toBe('Valoración: 4 de 5');
  });

  it('should omit rating when null', () => {
    expect(element.querySelector('.rating')).toBeNull();
  });

  it('should always show both confirmed reading dates, including missing values', () => {
    expect(element.querySelector('.reading-dates')?.textContent).toContain(
      'Inicio: Sin fecha · Fin: Sin fecha',
    );
    fixture.componentRef.setInput('book', testBook({ startedOn: '2024-02-29', finishedOn: null }));
    fixture.detectChanges();
    expect(element.querySelector('.reading-dates')?.textContent).toContain(
      'Inicio: 29/02/2024 · Fin: Sin fecha',
    );
    fixture.componentRef.setInput('book', testBook({ startedOn: null, finishedOn: '2026-10-12' }));
    fixture.detectChanges();
    expect(element.querySelector('.reading-dates')?.textContent).toContain(
      'Inicio: Sin fecha · Fin: 12/10/2026',
    );
  });

  it.each(['TO_READ', 'READING', 'READ', 'ABANDONED'] as const)(
    'should expose only allowed reading actions in %s and emit guarded intents',
    (readingStatus) => {
      fixture.componentRef.setInput('book', testBook({ readingStatus }));
      fixture.detectChanges();
      const buttons = Array.from(
        element.querySelectorAll<HTMLButtonElement>('.date-actions button'),
      );
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(
        readingStatus === 'TO_READ'
          ? ['Empezar lectura', 'Finalizar lectura', 'Gestionar fechas']
          : readingStatus === 'READING'
            ? ['Finalizar lectura', 'Gestionar fechas']
            : ['Gestionar fechas'],
      );
      expect(
        buttons.every((button) => button.getAttribute('aria-label')?.includes('Libro de prueba')),
      ).toBe(true);
      const start = vi.fn();
      const finish = vi.fn();
      const dates = vi.fn();
      fixture.componentInstance.startReadingRequested.subscribe(start);
      fixture.componentInstance.finishReadingRequested.subscribe(finish);
      fixture.componentInstance.readingDatesRequested.subscribe(dates);
      buttons.forEach((button) => button.click());
      expect(start).toHaveBeenCalledTimes(readingStatus === 'TO_READ' ? 1 : 0);
      expect(finish).toHaveBeenCalledTimes(
        readingStatus === 'TO_READ' || readingStatus === 'READING' ? 1 : 0,
      );
      expect(dates).toHaveBeenCalledExactlyOnceWith(1);
      if (readingStatus === 'TO_READ' || readingStatus === 'READING')
        expect(element.textContent).toContain('Usa la fecha de hoy');
    },
  );

  it.each([
    ['startReading', 'Iniciando lectura…'],
    ['finishReading', 'Finalizando lectura…'],
    ['updateReadingDates', 'Actualizando fechas…'],
    ['deleteReadingDates', 'Eliminando fechas…'],
  ])('should block all actions and announce %s', (action, label) => {
    fixture.componentRef.setInput('pendingAction', action);
    fixture.detectChanges();
    expect(
      Array.from(element.querySelectorAll<HTMLButtonElement>('button')).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(element.querySelector('mat-card-content [role="status"]')?.textContent?.trim()).toBe(
      label,
    );
    expect(element.querySelector('a')?.getAttribute('href')).toBeNull();
    const requested = vi.fn();
    fixture.componentInstance.startReadingRequested.subscribe(requested);
    fixture.componentInstance.finishReadingRequested.subscribe(requested);
    fixture.componentInstance.readingDatesRequested.subscribe(requested);
    fixture.componentInstance.requestReadingAction('startReading');
    fixture.componentInstance.requestReadingAction('finishReading');
    fixture.componentInstance.requestReadingAction('dates');
    expect(requested).not.toHaveBeenCalled();
  });

  async function selects() {
    return TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatSelectHarness);
  }

  it('should initialize accessible selects with readable states and Sin valorar', async () => {
    const [status, rating] = await selects();
    expect(await status.getValueText()).toBe('Por leer');
    expect(await rating.getValueText()).toBe('Sin valorar');
    expect(element.querySelectorAll('mat-select')[0].getAttribute('aria-label')).toBe(
      'Estado de lectura de Libro de prueba',
    );
    expect(element.querySelectorAll('mat-select')[1].getAttribute('aria-label')).toBe(
      'Valoración de Libro de prueba',
    );
    await status.open();
    expect(
      await Promise.all((await status.getOptions()).map((option) => option.getText())),
    ).toEqual(['Por leer', 'Leyendo', 'Leído', 'Abandonado']);
    await status.close();
    await rating.open();
    expect(
      await Promise.all((await rating.getOptions()).map((option) => option.getText())),
    ).toEqual(['Sin valorar', '1', '2', '3', '4', '5']);
    await rating.close();
  });

  it('should emit status intent but explicitly restore confirmed selection until a new BookResponse', async () => {
    const requested = vi.fn();
    fixture.componentInstance.readingStatusRequested.subscribe(requested);
    const [status] = await selects();
    await status.clickOptions({ text: 'Leyendo' });
    expect(requested).toHaveBeenCalledExactlyOnceWith({ id: 1, status: 'READING' });
    expect(await status.getValueText()).toBe('Por leer');
    fixture.componentRef.setInput('book', testBook({ readingStatus: 'READING' }));
    fixture.detectChanges();
    expect(await status.getValueText()).toBe('Leyendo');
  });

  it('should not emit identical status or rating selections', async () => {
    const statusRequested = vi.fn();
    const ratingRequested = vi.fn();
    fixture.componentInstance.readingStatusRequested.subscribe(statusRequested);
    fixture.componentInstance.ratingRequested.subscribe(ratingRequested);
    const [status, rating] = await selects();
    await status.clickOptions({ text: 'Por leer' });
    await rating.clickOptions({ text: 'Sin valorar' });
    expect(statusRequested).not.toHaveBeenCalled();
    expect(ratingRequested).not.toHaveBeenCalled();
  });

  it('should emit a number or deletion intent and retain confirmed rating', async () => {
    fixture.componentRef.setInput('book', testBook({ rating: 4 }));
    fixture.detectChanges();
    const requested = vi.fn();
    fixture.componentInstance.ratingRequested.subscribe(requested);
    const [, rating] = await selects();
    expect(await rating.getValueText()).toBe('4');
    await rating.clickOptions({ text: '5' });
    expect(requested).toHaveBeenLastCalledWith({ id: 1, rating: 5 });
    expect(await rating.getValueText()).toBe('4');
    await rating.clickOptions({ text: 'Sin valorar' });
    expect(requested).toHaveBeenLastCalledWith({ id: 1, rating: null });
    expect(await rating.getValueText()).toBe('4');
    await rating.clickOptions({ text: '4' });
    expect(requested).toHaveBeenCalledTimes(2);
  });

  it.each(['readingStatus', 'rating', 'deleteRating'])(
    'should lock all actions while %s is pending and announce progress',
    async (action) => {
      fixture.componentRef.setInput('pendingAction', action);
      fixture.detectChanges();
      const [status, rating] = await selects();
      expect(await status.isDisabled()).toBe(true);
      expect(await rating.isDisabled()).toBe(true);
      expect(element.querySelector('a')?.getAttribute('href')).toBeNull();
      expect((element.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
      expect(element.querySelector('mat-card-content [role="status"]')?.textContent?.trim()).toBe(
        action === 'readingStatus' ? 'Actualizando estado…' : 'Actualizando valoración…',
      );
      const deletion = vi.fn();
      fixture.componentInstance.deleteRequested.subscribe(deletion);
      fixture.componentInstance.requestDelete();
      expect(deletion).not.toHaveBeenCalled();
    },
  );

  it('should guard emitted events in code while globally disabled and restore confirmed values', () => {
    const status = vi.fn();
    const rating = vi.fn();
    fixture.componentInstance.readingStatusRequested.subscribe(status);
    fixture.componentInstance.ratingRequested.subscribe(rating);
    fixture.componentRef.setInput('updateDisabled', true);
    fixture.detectChanges();
    const source = { value: 'READING' } as MatSelect;
    fixture.componentInstance.onReadingStatusChange(new MatSelectChange(source, 'READING'));
    expect(source.value).toBe('TO_READ');
    fixture.componentInstance.onRatingChange(new MatSelectChange(source, 5));
    expect(source.value).toBeNull();
    expect(status).not.toHaveBeenCalled();
    expect(rating).not.toHaveBeenCalled();
  });

  it('should show a safe inline update error without altering values or locking actions', async () => {
    fixture.componentRef.setInput('updateError', 'No se pudo actualizar el libro');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'No se pudo actualizar el libro',
    );
    const [status, rating] = await selects();
    expect(await status.getValueText()).toBe('Por leer');
    expect(await rating.getValueText()).toBe('Sin valorar');
    expect(await status.isDisabled()).toBe(false);
  });
});

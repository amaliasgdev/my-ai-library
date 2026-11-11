import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ReadingListMembership } from '../../../reading-list/reading-list-membership';
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
    const link = element.querySelector('a[aria-label^="Editar "]');
    expect(link?.textContent?.trim()).toBe('Editar');
    expect(link?.getAttribute('href')).toBe('/books/1/edit');
    expect(link?.getAttribute('aria-label')).toBe('Editar Libro de prueba');
    const deletion = element.querySelector('mat-card-actions button');
    expect(deletion?.textContent?.trim()).toBe('Eliminar');
    expect(deletion?.getAttribute('aria-label')).toBe('Eliminar Libro de prueba');
    expect(element.querySelectorAll('mat-card-actions a, mat-card-actions button')).toHaveLength(3);
    expect(element.textContent).not.toMatch(/Hidden|9780132350884|2008/);
  });

  it('should emit the book to its parent without HTTP or a dialog', () => {
    const detail = element.querySelector('a[aria-label^="Ver detalle de "]');
    expect(detail?.textContent?.trim()).toBe('Ver detalle');
    expect(detail?.getAttribute('href')).toBe('/books/1');
    expect(detail?.getAttribute('aria-label')).toBe('Ver detalle de Libro de prueba');
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
    expect(element.querySelector('a[aria-label^="Editar "]')?.getAttribute('href')).toBe(
      '/books/1/edit',
    );
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

  it('should show the confirmed rating as accessible stars, and Sin valorar when null', () => {
    expect(element.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Valoración de Libro de prueba',
    );
    expect(checkedStar()).toBe(0);
    expect(element.querySelector('app-star-rating .summary')?.textContent).toBe('Sin valorar');
    fixture.componentRef.setInput('book', testBook({ rating: 4 }));
    fixture.detectChanges();
    expect(checkedStar()).toBe(4);
    expect(element.querySelectorAll('app-star-rating .star-button.filled')).toHaveLength(4);
    expect(element.querySelector('app-star-rating .summary')?.textContent).toBe('4 de 5');
    expect(element.querySelector('mat-form-field + app-star-rating')).not.toBeNull();
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
  const stars = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('app-star-rating button[role="radio"]'));
  const checkedStar = () =>
    stars().findIndex((star) => star.getAttribute('aria-checked') === 'true') + 1;
  const clearButton = () =>
    element.querySelector<HTMLButtonElement>('app-star-rating button.clear');

  it('should initialize the status select and the star rating with readable states', async () => {
    const [status, ...others] = await selects();
    expect(others).toHaveLength(0);
    expect(element.querySelectorAll('mat-select')).toHaveLength(1);
    expect(await status.getValueText()).toBe('Por leer');
    expect(element.querySelector('mat-select')?.getAttribute('aria-label')).toBe(
      'Estado de lectura de Libro de prueba',
    );
    expect(stars().map((star) => star.getAttribute('aria-label'))).toEqual([
      '1 estrella',
      '2 estrellas',
      '3 estrellas',
      '4 estrellas',
      '5 estrellas',
    ]);
    await status.open();
    expect(
      await Promise.all((await status.getOptions()).map((option) => option.getText())),
    ).toEqual(['Por leer', 'Leyendo', 'Leído', 'Abandonado']);
    await status.close();
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
    fixture.componentRef.setInput('book', testBook({ rating: 3 }));
    fixture.detectChanges();
    const statusRequested = vi.fn();
    const ratingRequested = vi.fn();
    fixture.componentInstance.readingStatusRequested.subscribe(statusRequested);
    fixture.componentInstance.ratingRequested.subscribe(ratingRequested);
    const [status] = await selects();
    await status.clickOptions({ text: 'Por leer' });
    stars()[2].click();
    expect(statusRequested).not.toHaveBeenCalled();
    expect(ratingRequested).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 5])(
    'should emit a rating intent of %s without touching the reading status',
    (rating) => {
      const requested = vi.fn();
      const status = vi.fn();
      fixture.componentInstance.ratingRequested.subscribe(requested);
      fixture.componentInstance.readingStatusRequested.subscribe(status);
      stars()[rating - 1].click();
      expect(requested).toHaveBeenCalledExactlyOnceWith({ id: 1, rating });
      expect(status).not.toHaveBeenCalled();
    },
  );

  it('should emit a number or deletion intent and retain the confirmed rating until a new BookResponse', () => {
    fixture.componentRef.setInput('book', testBook({ rating: 4 }));
    fixture.detectChanges();
    const requested = vi.fn();
    fixture.componentInstance.ratingRequested.subscribe(requested);
    expect(checkedStar()).toBe(4);
    stars()[4].click();
    fixture.detectChanges();
    expect(requested).toHaveBeenLastCalledWith({ id: 1, rating: 5 });
    expect(checkedStar()).toBe(4);
    clearButton()!.click();
    fixture.detectChanges();
    expect(requested).toHaveBeenLastCalledWith({ id: 1, rating: null });
    expect(checkedStar()).toBe(4);
    stars()[3].click();
    expect(requested).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('book', testBook({ rating: 5 }));
    fixture.detectChanges();
    expect(checkedStar()).toBe(5);
    fixture.componentRef.setInput('book', testBook({ rating: null }));
    fixture.detectChanges();
    expect(checkedStar()).toBe(0);
    expect(clearButton()).toBeNull();
  });

  it('should preview on hover without emitting any write intent', () => {
    const requested = vi.fn();
    fixture.componentInstance.ratingRequested.subscribe(requested);
    stars()[4].dispatchEvent(new MouseEvent('pointerenter'));
    fixture.detectChanges();
    expect(element.querySelectorAll('app-star-rating .star-button.filled')).toHaveLength(5);
    expect(checkedStar()).toBe(0);
    expect(requested).not.toHaveBeenCalled();
  });

  it.each(['readingStatus', 'rating', 'deleteRating'])(
    'should lock all actions while %s is pending and announce progress',
    async (action) => {
      fixture.componentRef.setInput('book', testBook({ rating: 3 }));
      fixture.componentRef.setInput('pendingAction', action);
      fixture.detectChanges();
      const [status] = await selects();
      expect(await status.isDisabled()).toBe(true);
      expect(stars().every((star) => star.disabled)).toBe(true);
      expect(clearButton()).toBeNull();
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
    fixture.componentInstance.onRatingChange(5);
    fixture.componentInstance.onRatingChange(null);
    expect(stars().every((star) => star.disabled)).toBe(true);
    expect(checkedStar()).toBe(0);
    expect(status).not.toHaveBeenCalled();
    expect(rating).not.toHaveBeenCalled();
  });

  it('should reject invalid rating values in code', () => {
    const rating = vi.fn();
    fixture.componentInstance.ratingRequested.subscribe(rating);
    for (const value of [0, 6, 2.5, NaN]) fixture.componentInstance.onRatingChange(value);
    expect(rating).not.toHaveBeenCalled();
  });

  it('should show a safe inline update error without altering values or locking actions', async () => {
    fixture.componentRef.setInput('book', testBook({ rating: 2 }));
    fixture.componentRef.setInput('updateError', 'No se pudo actualizar el libro');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'No se pudo actualizar el libro',
    );
    const [status] = await selects();
    expect(await status.getValueText()).toBe('Por leer');
    expect(checkedStar()).toBe(2);
    expect(await status.isDisabled()).toBe(false);
    expect(stars().every((star) => !star.disabled)).toBe(true);
  });

  describe('compact variant', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('compact', true);
      fixture.detectChanges();
    });

    it('is off by default and replaces only the presentation when on', () => {
      expect(element.querySelector('.compact-card')).not.toBeNull();
      expect(element.querySelector('app-star-rating, mat-select, .date-actions')).toBeNull();
      expect(element.querySelector('h2')?.textContent).toBe('Libro de prueba');
      expect(element.querySelector('a.compact-detail')?.getAttribute('aria-label')).toBe(
        'Ver detalle de Libro de prueba',
      );
      expect(element.querySelector('button.compact-menu-trigger')?.getAttribute('aria-label')).toBe(
        'Acciones de Libro de prueba',
      );
      fixture.componentRef.setInput('compact', false);
      fixture.detectChanges();
      expect(element.querySelector('.compact-card')).toBeNull();
      expect(element.querySelectorAll('app-star-rating button[role="radio"]')).toHaveLength(5);
    });

    it('emits guarded status and rating intents and never changes the confirmed values', () => {
      const status = vi.fn();
      const rating = vi.fn();
      fixture.componentInstance.readingStatusRequested.subscribe(status);
      fixture.componentInstance.ratingRequested.subscribe(rating);
      fixture.componentInstance.chooseReadingStatus('READING');
      fixture.componentInstance.chooseReadingStatus('TO_READ');
      fixture.componentInstance.chooseReadingStatus('BOGUS' as ReadingStatus);
      fixture.componentInstance.onRatingChange(4);
      fixture.componentInstance.onRatingChange(null);
      expect(status).toHaveBeenCalledExactlyOnceWith({ id: 1, status: 'READING' });
      expect(rating).toHaveBeenCalledExactlyOnceWith({ id: 1, rating: 4 });
      fixture.componentRef.setInput('updateDisabled', true);
      fixture.detectChanges();
      fixture.componentInstance.chooseReadingStatus('READ');
      fixture.componentInstance.onRatingChange(5);
      expect(status).toHaveBeenCalledTimes(1);
      expect(rating).toHaveBeenCalledTimes(1);
    });

    it('adds to the reading list only when idle', () => {
      const add = vi.fn();
      const list = { busy: signal(false), add } as unknown as ReadingListMembership;
      fixture.componentInstance.addToReadingList(list);
      expect(add).toHaveBeenCalledExactlyOnceWith(1);
      fixture.componentRef.setInput('pendingAction', 'rating');
      fixture.detectChanges();
      fixture.componentInstance.addToReadingList(list);
      expect(add).toHaveBeenCalledTimes(1);
    });

    it('blocks the trigger, link and progress while an action is pending', () => {
      fixture.componentRef.setInput('pendingAction', 'startReading');
      fixture.detectChanges();
      expect(element.querySelector<HTMLButtonElement>('.compact-menu-trigger')?.disabled).toBe(
        true,
      );
      expect(element.querySelector('a.compact-detail')?.getAttribute('aria-disabled')).toBe('true');
      expect(element.querySelector('.compact-progress')?.textContent?.trim()).toBe(
        'Iniciando lectura…',
      );
    });
  });
});

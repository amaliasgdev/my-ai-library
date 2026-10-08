import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
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

  it('should render title, author and only an accessible edit action without extra metadata', async () => {
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
    expect(element.querySelectorAll('a, button')).toHaveLength(1);
    expect(element.textContent).not.toMatch(/Hidden|9780132350884|2008/);
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
});

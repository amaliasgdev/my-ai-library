import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
import { BooksPlaceholder } from './books-placeholder';

describe('BooksPlaceholder', () => {
  it('should render an actual Material card without book data or forms', async () => {
    await TestBed.configureTestingModule({ imports: [BooksPlaceholder] }).compileComponents();
    const fixture = TestBed.createComponent(BooksPlaceholder);
    await fixture.whenStable();
    const card = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatCardHarness);
    expect(await card.getTitleText()).toBe('Un punto de partida');
    expect(await card.getText()).toContain('Angular y Angular Material están configurados');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('El frontend está preparado.');
    expect(element.querySelector('form, table, input')).toBeNull();
  });
});

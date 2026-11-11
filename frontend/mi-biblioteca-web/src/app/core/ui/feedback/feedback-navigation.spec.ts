import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FeedbackService } from './feedback.service';

@Component({
  template: `<button type="button" (click)="notifyAndLeave()">Guardar</button>`,
})
class SourcePage {
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);

  notifyAndLeave(): void {
    this.feedback.success('Libro creado.');
    void this.router.navigateByUrl('/next');
  }
}

@Component({ template: `<p>Destino</p>` })
class DestinationPage {}

describe('FeedbackService navigation survival', () => {
  it('keeps a success snackbar visible after navigating to another route', async () => {
    TestBed.configureTestingModule({
      imports: [SourcePage, DestinationPage],
      providers: [
        provideRouter([
          { path: '', component: SourcePage },
          { path: 'next', component: DestinationPage },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create('/');
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('button')!;
    button.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/next');
    expect(document.body.textContent).toContain('Libro creado.');
  });
});

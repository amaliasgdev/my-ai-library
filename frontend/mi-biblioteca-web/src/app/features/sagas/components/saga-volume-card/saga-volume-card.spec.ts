import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { testPendingSagaVolume, testSagaVolume } from '../../models/saga.testing';
import { SagaVolume } from '../../models/saga.models';
import { SagaVolumeCard } from './saga-volume-card';

describe('SagaVolumeCard', () => {
  let fixture: ComponentFixture<SagaVolumeCard>;
  let page: SagaVolumeCard;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SagaVolumeCard],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SagaVolumeCard);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  function render(volume: SagaVolume, first = false, last = false, busy = false): void {
    fixture.componentRef.setInput('volume', volume);
    fixture.componentRef.setInput('first', first);
    fixture.componentRef.setInput('last', last);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
  }

  it('renders a linked volume with position, label, real book data and status', () => {
    render(
      testSagaVolume({
        position: 3,
        volumeLabel: '0.5',
        bookId: 10,
        book: {
          id: 10,
          title: 'El imperio final',
          author: 'Brandon Sanderson',
          coverUrl: null,
          readingStatus: 'READ',
          rating: 5,
          finishedOn: null,
        },
      }),
    );
    expect(element.textContent).toContain('Posición 3');
    expect(element.textContent).toContain('0.5');
    expect(element.textContent).toContain('El imperio final');
    expect(element.textContent).toContain('Brandon Sanderson');
    expect(element.textContent).toContain('Leído');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/10');
    expect(element.textContent).not.toContain('Pendiente de incorporar');
  });

  it('renders a pending volume without reading status', () => {
    render(testPendingSagaVolume({ pendingTitle: 'Precuela desconocida', volumeLabel: null }));
    expect(element.textContent).toContain('Precuela desconocida');
    expect(element.textContent).toContain('Aún no está en la biblioteca');
    expect(element.textContent).toContain('Pendiente de incorporar');
    expect(element.textContent).not.toContain('Leído');
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('.status')).toBeNull();
  });

  it('exposes accessible drag, reorder and menu labels', () => {
    render(testSagaVolume({ book: { ...testSagaVolume().book!, title: 'Título muy largo' } }));
    expect(element.querySelector('.drag-handle')?.getAttribute('aria-label')).toBe(
      'Arrastrar Título muy largo',
    );
    expect(element.querySelector('button[aria-label="Subir Título muy largo"]')).not.toBeNull();
    expect(element.querySelector('button[aria-label="Bajar Título muy largo"]')).not.toBeNull();
    expect(element.querySelector('.volume-menu-trigger')?.getAttribute('aria-label')).toBe(
      'Acciones de Título muy largo',
    );
  });

  it('disables the first, last and busy actions', () => {
    render(testSagaVolume(), true, true, true);
    expect(element.querySelector<HTMLButtonElement>('button[aria-label^="Subir"]')?.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLButtonElement>('button[aria-label^="Bajar"]')?.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLButtonElement>('.volume-menu-trigger')?.disabled).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('.drag-handle')?.disabled).toBe(true);
  });

  it('emits reorder actions', () => {
    render(testSagaVolume());
    const up = vi.fn();
    const down = vi.fn();
    page.moveUp.subscribe(up);
    page.moveDown.subscribe(down);
    element.querySelector<HTMLButtonElement>('button[aria-label^="Subir"]')!.click();
    element.querySelector<HTMLButtonElement>('button[aria-label^="Bajar"]')!.click();
    expect(up).toHaveBeenCalledWith(testSagaVolume());
    expect(down).toHaveBeenCalledWith(testSagaVolume());
  });

  it('emits edit, link and remove actions from the menu', async () => {
    render(testPendingSagaVolume());
    const edit = vi.fn();
    const link = vi.fn();
    const remove = vi.fn();
    page.editRequested.subscribe(edit);
    page.linkRequested.subscribe(link);
    page.removeRequested.subscribe(remove);

    const clickMenu = async (text: string) => {
      element.querySelector<HTMLButtonElement>('.volume-menu-trigger')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const item = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'),
      ).find((candidate) => candidate.textContent?.trim().startsWith(text))!;
      item.click();
      await fixture.whenStable();
    };

    await clickMenu('Editar etiqueta');
    await clickMenu('Vincular a un libro');
    await clickMenu('Quitar de la saga');
    expect(edit).toHaveBeenCalledOnce();
    expect(link).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('emits unlink for a linked volume and not link', async () => {
    render(testSagaVolume());
    const unlink = vi.fn();
    page.unlinkRequested.subscribe(unlink);
    element.querySelector<HTMLButtonElement>('.volume-menu-trigger')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const item = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'),
    ).find((candidate) => candidate.textContent?.trim() === 'Desvincular libro')!;
    item.click();
    expect(unlink).toHaveBeenCalledOnce();
  });

  it('falls back to a placeholder when the cover fails', () => {
    render(
      testSagaVolume({
        book: {
          ...testSagaVolume().book!,
          coverUrl: 'https://example.test/broken.jpg',
        },
      }),
    );
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('Sin portada');
  });
});

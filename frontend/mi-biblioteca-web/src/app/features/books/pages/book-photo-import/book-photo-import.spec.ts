import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookPhotoImport } from './book-photo-import';

describe('BookPhotoImport local photographs', () => {
  let fixture: ComponentFixture<BookPhotoImport>;
  let page: BookPhotoImport;
  let root: HTMLElement;
  let http: HttpTestingController;
  const createUrl = vi.fn<(file: Blob) => string>();
  const revokeUrl = vi.fn<(url: string) => void>();

  beforeEach(() => {
    createUrl.mockReset().mockImplementation(() => `blob:photo-${createUrl.mock.calls.length}`);
    revokeUrl.mockReset();
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: createUrl,
        revokeObjectURL: revokeUrl,
      }),
    );
    TestBed.configureTestingModule({
      imports: [BookPhotoImport],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(BookPhotoImport);
    page = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.expectNone(() => true);
    http.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function photo(name = 'lomos.jpg', type = 'image/jpeg', size = 10): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  function input(capture = false): HTMLInputElement {
    return root.querySelector(capture ? 'input[capture]' : 'input[multiple]')!;
  }

  function select(files: File[], capture = false): void {
    Object.defineProperty(input(capture), 'files', { configurable: true, value: files });
    input(capture).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(root.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === text,
    )!;
  }

  function drop(files: File[]): Event {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    root.querySelector('.photo-input')!.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('starts empty with analysis disabled and explains local-only disconnected recognition', () => {
    expect(root.querySelector('h1')?.textContent).toBe('Importar libros desde fotografías');
    expect(root.textContent).toContain('0 de 3 fotografías seleccionadas');
    expect(root.textContent).toContain('El reconocimiento todavía no está conectado');
    expect(root.textContent).toContain('No se envían imágenes');
    expect(root.textContent).toContain('HEIC/HEIF');
    expect(button('Analizar fotografías').disabled).toBe(true);
    expect(root.querySelector('img')).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('offers keyboard-operable Material buttons for multiple selection and native capture', () => {
    const choose = vi.spyOn(input(), 'click');
    const camera = vi.spyOn(input(true), 'click');
    button('Seleccionar fotografías').click();
    button('Tomar fotografía').click();
    expect(choose).toHaveBeenCalledOnce();
    expect(camera).toHaveBeenCalledOnce();
    expect(input().multiple).toBe(true);
    expect(input().accept).toBe('image/jpeg,image/png');
    expect(input(true).getAttribute('capture')).toBe('environment');
    expect(input(true).multiple).toBe(false);
    expect(button('Seleccionar fotografías').type).toBe('button');
    expect(button('Tomar fotografía').disabled).toBe(false);
  });

  it('previews a JPEG through its Object URL without reading or modifying its bytes', () => {
    const file = photo();
    select([file]);
    const image = root.querySelector('img')!;
    expect(createUrl).toHaveBeenCalledExactlyOnceWith(file);
    expect(image.getAttribute('src')).toBe('blob:photo-1');
    expect(image.alt).toBe('Vista previa local de lomos.jpg');
    expect(page.photos()[0].file).toBe(file);
    expect(root.textContent).toContain('1 de 3 fotografías seleccionadas');
    expect(button('Analizar fotografías').disabled).toBe(true);
  });

  it('accepts a multiple JPEG/PNG selection and appends another selection up to three', () => {
    select([photo(), photo('portada.png', 'image/png')]);
    select([photo('otro.jpg')]);
    expect(root.querySelectorAll('img')).toHaveLength(3);
    expect(page.errors()).toEqual([]);
    expect(root.textContent).toContain('3 de 3 fotografías seleccionadas');
  });

  it('accepts an image chosen through native camera capture', () => {
    select([photo('camara.jpg')], true);
    expect(page.photos()[0].file.name).toBe('camara.jpg');
    expect(input(true).value).toBe('');
  });

  it('rejects an over-limit batch entirely, without silent truncation or Object URLs', () => {
    select([photo(), photo(), photo(), photo()]);
    expect(page.photos()).toEqual([]);
    expect(createUrl).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('máximo de 3');
  });

  it('keeps previous photographs when an appended selection would exceed three', () => {
    const first = photo();
    select([first]);
    select([photo(), photo(), photo()]);
    expect(page.photos().map((item) => item.file)).toEqual([first]);
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it('accepts the exact byte limit and rejects one byte above it', () => {
    select([photo('limite.jpg', 'image/jpeg', 5 * 1024 * 1024)]);
    select([photo('grande.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)]);
    expect(page.photos()).toHaveLength(1);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('5.242.880 bytes');
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it.each([
    ['vector.svg', 'image/svg+xml'],
    ['documento.pdf', 'application/pdf'],
    ['animacion.gif', 'image/gif'],
    ['iphone.heic', 'image/heic'],
    ['iphone.heif', 'image/heif'],
    ['imagen.webp', 'image/webp'],
    ['disfrazado.jpg', 'text/plain'],
    ['desconocido.jpg', ''],
  ])('rejects unsupported format %s instead of trusting its extension', (name, type) => {
    select([photo(name, type)]);
    expect(page.photos()).toEqual([]);
    expect(createUrl).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('formato no compatible');
  });

  it('rejects empty images', () => {
    select([photo('vacia.png', 'image/png', 0)]);
    expect(page.photos()).toEqual([]);
    expect(root.textContent).toContain('el archivo está vacío');
  });

  it('does not partially accept a mixed valid/invalid batch', () => {
    select([photo(), photo('iphone.heic', 'image/heic')]);
    expect(page.photos()).toEqual([]);
    expect(createUrl).not.toHaveBeenCalled();
    expect(root.textContent).toContain('No se ha añadido ninguna fotografía');
  });

  it('treats cancelling either file dialog as a no-op', () => {
    select([photo()]);
    select([]);
    select([], true);
    expect(page.photos()).toHaveLength(1);
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it('accepts dropped photographs through the same limits and validation', () => {
    expect(drop([photo(), photo('portada.png', 'image/png')]).defaultPrevented).toBe(true);
    expect(page.photos()).toHaveLength(2);
    drop([photo(), photo()]);
    expect(page.photos()).toHaveLength(2);
    expect(root.textContent).toContain('máximo de 3');
    drop([photo('iphone.heic', 'image/heic')]);
    expect(page.photos()).toHaveLength(2);
    expect(root.textContent).toContain('formato no compatible');
  });

  it('prevents browser drag navigation and offers a copy drop effect', () => {
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    const transfer = { dropEffect: '' };
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    root.querySelector('.photo-input')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe('copy');
  });

  it('does not fetch links or accept text drops', () => {
    drop([]);
    expect(page.photos()).toEqual([]);
    expect(root.textContent).toContain('no enlaces ni carpetas');
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('revokes a removed URL immediately and restores keyboard focus to selection', () => {
    select([photo(), photo('segunda.png', 'image/png')]);
    button('Retirar').focus();
    button('Retirar').click();
    fixture.detectChanges();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:photo-1');
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(document.activeElement).toBe(button('Seleccionar fotografías'));
    expect(root.textContent).toContain('1 de 3 fotografías seleccionadas');
  });

  it('can select the same file again after removing it, with a new URL', () => {
    const file = photo();
    select([file]);
    page.removePhoto(page.photos()[0].id);
    select([file]);
    expect(page.photos()[0].previewUrl).toBe('blob:photo-2');
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:photo-1');
    expect(input().value).toBe('');
  });

  it('tracks pending rotation independently from original bytes and wraps at 360 degrees', () => {
    const file = photo();
    select([file, photo('otra.jpg')]);
    const id = page.photos()[0].id;
    const original = page.photos()[0];
    for (const rotation of [90, 180, 270, 0]) {
      button('Rotar 90°').click();
      fixture.detectChanges();
      expect(page.photos()[0].rotationDegrees).toBe(rotation);
      expect(root.querySelector('img')!.style.transform).toBe(`rotate(${rotation}deg)`);
      expect(page.photos()[0].file).toBe(file);
      expect(page.photos()[0].previewUrl).toBe(original.previewUrl);
      expect(page.photos()[1].rotationDegrees).toBe(0);
    }
    expect(page.photos()[0].id).toBe(id);
    expect(root.textContent).toContain('El archivo original no se modifica');
    expect(createUrl).toHaveBeenCalledTimes(2);
    expect(revokeUrl).not.toHaveBeenCalled();
    expect(
      root.querySelector('[aria-label="Rotar 90 grados a la derecha: lomos.jpg"]'),
    ).not.toBeNull();
    expect(root.querySelector('[aria-label="Retirar fotografía: lomos.jpg"]')).not.toBeNull();
  });

  it('removes unreadable previews and revokes their URL without retrying', () => {
    select([photo('corrupta.jpg')]);
    root.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(page.photos()).toEqual([]);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:photo-1');
    expect(root.textContent).toContain('no se pudo leer la fotografía');
  });

  it('revokes every remaining URL once on destruction, including rotated photographs', () => {
    select([photo(), photo('dos.jpg'), photo('tres.png', 'image/png')]);
    page.rotatePhoto(page.photos()[1].id);
    page.removePhoto(page.photos()[0].id);
    fixture.destroy();
    expect(revokeUrl.mock.calls.map(([url]) => url)).toEqual([
      'blob:photo-1',
      'blob:photo-2',
      'blob:photo-3',
    ]);
    expect(page.photos()).toEqual([]);
  });

  it('cleans up partial URL allocation failures and preserves previous selection', () => {
    select([photo()]);
    createUrl.mockReturnValueOnce('blob:temporary').mockImplementationOnce(() => {
      throw new Error('Object URL unavailable');
    });
    select([photo('dos.jpg'), photo('tres.jpg')]);
    expect(page.photos()).toHaveLength(1);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:temporary');
    expect(root.textContent).toContain('No se pudieron preparar las vistas previas');
  });

  it('never sends HTTP or persists photographs during selection, rotation, removal or analysis clicks', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.spyOn(globalThis, 'fetch');
    select([photo()]);
    button('Rotar 90°').click();
    button('Analizar fotografías').click();
    button('Retirar').click();
    http.expectNone(() => true);
    expect(fetch).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(button('Analizar fotografías').disabled).toBe(true);
  });
});

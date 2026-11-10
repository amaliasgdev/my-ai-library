import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from '../../models/book-catalog-query';

interface LocalPhoto {
  readonly id: number;
  readonly file: File;
  readonly previewUrl: string;
  /** Pending clockwise rotation relative to the browser-oriented original; not encoded in file. */
  readonly rotationDegrees: 0 | 90 | 180 | 270;
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-book-photo-import',
  imports: [RouterLink, MatButtonModule, MatCardModule],
  templateUrl: './book-photo-import.html',
  styleUrl: './book-photo-import.scss',
})
export class BookPhotoImport {
  private readonly destroyRef = inject(DestroyRef);
  private nextId = 0;
  readonly catalogParams = serializeBookCatalogQuery(
    parseBookCatalogQuery(inject(ActivatedRoute).snapshot.queryParamMap),
  );
  readonly photos = signal<readonly LocalPhoto[]>([]);
  readonly errors = signal<readonly string[]>([]);
  readonly maxPhotos = MAX_PHOTOS;

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const photo of this.photos()) URL.revokeObjectURL(photo.previewUrl);
      this.photos.set([]);
    });
  }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Allow choosing the same file again after removal or a rejected selection.
    input.value = '';
    this.addFiles(files);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  dropFiles(event: DragEvent): void {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) {
      this.errors.set(['Arrastra archivos JPEG o PNG, no enlaces ni carpetas.']);
      return;
    }
    this.addFiles(files);
  }

  private addFiles(files: readonly File[]): void {
    if (this.destroyRef.destroyed || !files.length) return;
    if (this.photos().length + files.length > MAX_PHOTOS) {
      this.errors.set([
        'Puedes seleccionar un máximo de 3 fotografías. No se ha añadido ninguna de esta selección; retira una fotografía o elige menos archivos.',
      ]);
      return;
    }
    const errors: string[] = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        errors.push(
          `${file.name}: formato no compatible. Utiliza JPEG o PNG; HEIC/HEIF, WebP, SVG, PDF y GIF no se admiten.`,
        );
      } else if (!file.size) {
        errors.push(`${file.name}: el archivo está vacío.`);
      } else if (file.size > MAX_PHOTO_BYTES) {
        errors.push(`${file.name}: supera el máximo de 5 MB (5.242.880 bytes).`);
      }
    }
    if (errors.length) {
      this.errors.set([...errors, 'No se ha añadido ninguna fotografía de esta selección.']);
      return;
    }
    const added: LocalPhoto[] = [];
    try {
      for (const file of files) {
        added.push({
          id: ++this.nextId,
          file,
          previewUrl: URL.createObjectURL(file),
          rotationDegrees: 0,
        });
      }
    } catch {
      for (const photo of added) URL.revokeObjectURL(photo.previewUrl);
      this.errors.set([
        'No se pudieron preparar las vistas previas. Vuelve a seleccionar las fotografías.',
      ]);
      return;
    }
    this.photos.update((photos) => [...photos, ...added]);
    this.errors.set([]);
  }

  removePhoto(id: number): void {
    const photo = this.photos().find((item) => item.id === id);
    if (!photo) return;
    URL.revokeObjectURL(photo.previewUrl);
    this.photos.update((photos) => photos.filter((item) => item.id !== id));
  }

  rotatePhoto(id: number): void {
    this.photos.update((photos) =>
      photos.map((photo) =>
        photo.id === id
          ? {
              ...photo,
              rotationDegrees: ((photo.rotationDegrees + 90) %
                360) as LocalPhoto['rotationDegrees'],
            }
          : photo,
      ),
    );
  }

  previewFailed(id: number): void {
    const photo = this.photos().find((item) => item.id === id);
    if (!photo) return;
    this.removePhoto(id);
    this.errors.update((errors) => [
      ...errors,
      `${photo.file.name}: no se pudo leer la fotografía. Elige un JPEG o PNG válido.`,
    ]);
  }
}

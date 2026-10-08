import { Component, input, OnChanges, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { BookResponse, ReadingStatus } from '../../models/book.models';

@Component({
  selector: 'app-book-card',
  imports: [MatCardModule, MatButtonModule, RouterLink],
  templateUrl: './book-card.html',
  styleUrl: './book-card.scss',
})
export class BookCard implements OnChanges {
  readonly book = input.required<BookResponse>();
  protected readonly imageFailed = signal(false);
  protected readonly statusLabels: Record<ReadingStatus, string> = {
    TO_READ: 'Por leer',
    READING: 'Leyendo',
    READ: 'Leído',
    ABANDONED: 'Abandonado',
  };
  private previousCoverUrl: string | null | undefined;

  ngOnChanges(): void {
    if (this.book().coverUrl !== this.previousCoverUrl) {
      this.previousCoverUrl = this.book().coverUrl;
      this.imageFailed.set(false);
    }
  }

  protected onImageError(): void {
    this.imageFailed.set(true);
  }
}

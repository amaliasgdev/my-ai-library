import { Component, input, OnChanges, output, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { BookResponse, BookUpdateAction, ReadingStatus } from '../../models/book.models';
import { displayReadingDate, READING_STATUS_LABELS } from '../../models/book-display';

@Component({
  selector: 'app-book-card',
  imports: [MatCardModule, MatButtonModule, RouterLink, MatFormFieldModule, MatSelectModule],
  templateUrl: './book-card.html',
  styleUrl: './book-card.scss',
})
export class BookCard implements OnChanges {
  readonly book = input.required<BookResponse>();
  readonly deleting = input(false);
  readonly deleteDisabled = input(false);
  readonly deleteRequested = output<BookResponse>();
  readonly pendingAction = input<BookUpdateAction | null>(null);
  readonly updateDisabled = input(false);
  readonly updateError = input<string | null>(null);
  readonly readingStatusRequested = output<{ id: number; status: ReadingStatus }>();
  readonly ratingRequested = output<{ id: number; rating: number | null }>();
  readonly startReadingRequested = output<number>();
  readonly finishReadingRequested = output<number>();
  readonly readingDatesRequested = output<number>();
  protected readonly progressLabels: Record<BookUpdateAction, string> = {
    readingStatus: 'Actualizando estado…',
    rating: 'Actualizando valoración…',
    deleteRating: 'Actualizando valoración…',
    startReading: 'Iniciando lectura…',
    finishReading: 'Finalizando lectura…',
    updateReadingDates: 'Actualizando fechas…',
    deleteReadingDates: 'Eliminando fechas…',
  };
  protected readonly statuses: ReadingStatus[] = ['TO_READ', 'READING', 'READ', 'ABANDONED'];
  protected readonly ratings = [1, 2, 3, 4, 5];
  protected readonly imageFailed = signal(false);
  protected readonly statusLabels = READING_STATUS_LABELS;
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

  requestDelete(): void {
    if (!this.deleting() && !this.pendingAction() && !this.deleteDisabled())
      this.deleteRequested.emit(this.book());
  }

  protected readonly displayDate = displayReadingDate;

  requestReadingAction(action: 'startReading' | 'finishReading' | 'dates'): void {
    if (this.deleting() || this.pendingAction() || this.updateDisabled()) return;
    const status = this.book().readingStatus;
    if (action === 'startReading' && status === 'TO_READ')
      this.startReadingRequested.emit(this.book().id);
    else if (action === 'finishReading' && (status === 'TO_READ' || status === 'READING'))
      this.finishReadingRequested.emit(this.book().id);
    else if (action === 'dates') this.readingDatesRequested.emit(this.book().id);
  }

  onReadingStatusChange(event: MatSelectChange): void {
    const status: ReadingStatus = event.value;
    // MatSelect has already selected the requested value. Restore the confirmed one
    // explicitly even when the input binding has not changed.
    event.source.value = this.book().readingStatus;
    if (
      this.deleting() ||
      this.pendingAction() ||
      this.updateDisabled() ||
      status === this.book().readingStatus ||
      !this.statuses.includes(status)
    )
      return;
    this.readingStatusRequested.emit({ id: this.book().id, status });
  }

  onRatingChange(event: MatSelectChange): void {
    const rating: number | null = event.value;
    event.source.value = this.book().rating;
    if (
      this.deleting() ||
      this.pendingAction() ||
      this.updateDisabled() ||
      rating === this.book().rating ||
      (rating !== null && !this.ratings.includes(rating))
    )
      return;
    this.ratingRequested.emit({ id: this.book().id, rating });
  }
}

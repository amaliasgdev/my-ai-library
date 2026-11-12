import { Component, computed, input, OnChanges, output, signal } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { MORE_ICON, registerAppIcons } from '../../../../core/icons/app-icons';
import { READING_STATUS_LABELS } from '../../../books/models/book-display';
import { SagaVolume } from '../../models/saga.models';

@Component({
  selector: 'app-saga-volume-card',
  imports: [
    CdkDragHandle,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
  ],
  templateUrl: './saga-volume-card.html',
  styleUrl: './saga-volume-card.scss',
})
export class SagaVolumeCard implements OnChanges {
  readonly volume = input.required<SagaVolume>();
  readonly first = input(false);
  readonly last = input(false);
  readonly busy = input(false);
  readonly moveUp = output<SagaVolume>();
  readonly moveDown = output<SagaVolume>();
  readonly editRequested = output<SagaVolume>();
  readonly linkRequested = output<SagaVolume>();
  readonly unlinkRequested = output<SagaVolume>();
  readonly removeRequested = output<SagaVolume>();
  protected readonly moreIcon = MORE_ICON;
  protected readonly imageFailed = signal(false);
  protected readonly title = computed(
    () => this.volume().book?.title ?? this.volume().pendingTitle ?? 'Volumen sin título',
  );
  protected readonly linked = computed(() => this.volume().book !== null);
  protected readonly statusLabel = computed(() => {
    const book = this.volume().book;
    return book ? READING_STATUS_LABELS[book.readingStatus] : '';
  });
  private previousCoverUrl: string | null | undefined;

  constructor() {
    registerAppIcons();
  }

  ngOnChanges(): void {
    const coverUrl = this.volume().book?.coverUrl ?? null;
    if (coverUrl !== this.previousCoverUrl) {
      this.previousCoverUrl = coverUrl;
      this.imageFailed.set(false);
    }
  }

  protected imageError(): void {
    this.imageFailed.set(true);
  }
}

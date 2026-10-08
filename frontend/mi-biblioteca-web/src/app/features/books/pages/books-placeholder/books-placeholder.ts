import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-books-placeholder',
  imports: [MatCardModule],
  templateUrl: './books-placeholder.html',
  styleUrl: './books-placeholder.scss',
})
export class BooksPlaceholder {}

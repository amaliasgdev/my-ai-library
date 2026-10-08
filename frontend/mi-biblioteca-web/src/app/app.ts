import { Component } from '@angular/core';
import { AppShell } from './layout/app-shell/app-shell';

@Component({
  imports: [AppShell],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}

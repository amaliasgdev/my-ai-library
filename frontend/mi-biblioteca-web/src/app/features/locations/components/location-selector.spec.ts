import { TestBed } from '@angular/core/testing';
import { LocationSelector } from './location-selector';
import { testLocations } from '../models/location.testing';

describe('LocationSelector UI only', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [LocationSelector] });
    const fixture = TestBed.createComponent(LocationSelector);
    fixture.componentRef.setInput('rooms', testLocations());
    fixture.detectChanges();
    return { fixture, selector: fixture.componentInstance };
  }
  it('opens explicitly, renders dependent Material selects and emits creation with the selected parent', () => {
    const { fixture, selector } = create();
    const load = vi.fn();
    const created = vi.fn();
    selector.loadRequested.subscribe(load);
    selector.createRequested.subscribe(created);
    selector.open();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelectorAll('mat-select')).toHaveLength(3);
    selector.roomChanged(1);
    expect(selector.bookcases().map((b) => b.name)).toEqual(['Billy izquierda']);
    selector.bookcaseChanged(2);
    expect(selector.shelves().map((s) => s.name)).toEqual(['Superior', '3']);
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.includes('Nueva balda'))!.click();
    expect(created).toHaveBeenCalledWith({ level: 'shelves', parentId: 2 });
  });
  it('changing room or bookcase resets descendants and marks the draft incomplete until Shelf or clear', () => {
    const { selector } = create();
    const selected = vi.fn();
    selector.selected.subscribe(selected);
    selector.roomChanged(1);
    selector.bookcaseChanged(2);
    selector.shelfChanged(3);
    expect(selected).toHaveBeenLastCalledWith({ shelfId: 3, incomplete: false, clearLegacy: true });
    selector.roomChanged(5);
    expect(selector.bookcaseId()).toBeNull();
    expect(selector.shelves()).toEqual([]);
    expect(selected).toHaveBeenLastCalledWith({
      shelfId: null,
      incomplete: true,
      clearLegacy: true,
    });
    selector.clear();
    expect(selector.roomId()).toBeNull();
    expect(selected).toHaveBeenLastCalledWith({
      shelfId: null,
      incomplete: false,
      clearLegacy: true,
    });
  });
  it('preloads IDs to dependent parents after loading, showing names only', () => {
    const { fixture, selector } = create();
    fixture.componentRef.setInput('shelfId', 3);
    fixture.componentRef.setInput('summary', 'Salón · Billy izquierda · Superior');
    fixture.detectChanges();
    expect(selector.roomId()).toBe(1);
    expect(selector.bookcaseId()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Salón · Billy izquierda · Balda Superior');
  });
  it('legacy remains untouched by opening/loading; clearing/replacing is explicit', () => {
    const { fixture, selector } = create();
    fixture.componentRef.setInput('legacy', true);
    fixture.detectChanges();
    const selected = vi.fn();
    selector.selected.subscribe(selected);
    selector.open();
    fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Ubicación textual anterior pendiente');
  });
  it('disabled prevents all selection and loading actions with code guards', () => {
    const { fixture, selector } = create();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const changed = vi.fn();
    selector.selected.subscribe(changed);
    const load = vi.fn();
    selector.loadRequested.subscribe(load);
    selector.open();
    selector.roomChanged(1);
    selector.bookcaseChanged(2);
    selector.shelfChanged(3);
    selector.clear();
    expect(changed).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});

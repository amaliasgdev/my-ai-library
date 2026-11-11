# Catalog card density (UX 02)

In-memory visual preference only: no `localStorage`, URL, backend or HTTP involvement. The
selector **Tarjetas por fila** sits in the catalog toolbar next to the book counter (grid icon,
Material select). Options: Automático, 2, 3, 4, 5, 6, 8 and 10.

## How the grid works

- **Automático**: the original grid (`repeat(auto-fill, minmax(min(100%, 15rem), 1fr))`).
- **2–6**: `--book-columns` is a _maximum_. `repeat(auto-fill, minmax(min(100%, max(--fixed-card-min,
<width of 1/N>)), 1fr))` gives N columns when they fit and fewer otherwise, so phones and tablets
  reflow by themselves, never scroll sideways and cards are never narrower than 10rem.
- **8 and 10**: the same rule with `--fixed-card-min: 6rem` and a 0.5rem gap, and the **compact
  card**. 6rem is what allows 10 columns inside the 72rem content width (about 101px each).
  Narrower viewports drop columns just as above. The compact card is chosen by the selection
  (8/10), not by how many columns end up fitting.

## Compact card

Cover first, a short title (three-line clamp, full text in the accessible name and `title`), a
**Ver detalle** link (`aria-label="Ver detalle de …"`) and a menu button **Acciones de …**.
The full card (Automático and 2–6) is not changed.

### Difference with the detail page (resolved)

`/books/:id` offers Editar, Eliminar and the reading-list action, but by design it has no
inline writes. The full card also lets you change the reading status, rate, start/finish
reading and manage the reading dates. Removing those from dense cards would have dropped
capabilities, so the compact card's accessible Material menu exposes **all** of them:

| Menu item                                                        | Same behavior as the full card                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Editar                                                           | link to `/books/:id/edit` with catalog context              |
| Estado de lectura ▸                                              | PATCH reading status (radio items, confirmed value checked) |
| Valoración ▸                                                     | PUT 1–5 / DELETE (Sin valorar, 1–5 estrellas)               |
| Empezar / Finalizar lectura                                      | POST with today's local date                                |
| Gestionar fechas                                                 | the existing dates dialog                                   |
| Añadir a lista de lectura / En mi lista / Reintentar pertenencia | membership actions                                          |
| Eliminar                                                         | the existing confirmation dialog                            |

Pending/deleting guards are identical (menu trigger and link are disabled while that book has a
pending write), errors stay inline and the confirmed values are restored by the same code paths.

## Limits

Layout cannot be measured in jsdom: tests assert the CSS contract and DOM, not real column
counts. Manual checks by viewport width, phone and screen reader are still pending.

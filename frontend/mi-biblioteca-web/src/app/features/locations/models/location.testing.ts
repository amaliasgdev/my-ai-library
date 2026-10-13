import { RoomNode } from './location.models';

/** Offline test fixture only. */
export function testLocations(): RoomNode[] {
  return [
    {
      id: 1,
      name: 'Salón',
      bookCount: 2,
      canDelete: false,
      blockedReason: 'BOOKCASES',
      bookcases: [
        {
          id: 2,
          name: 'Billy izquierda',
          bookCount: 2,
          canDelete: false,
          blockedReason: 'SHELVES',
          shelves: [
            { id: 3, name: 'Superior', bookCount: 2, canDelete: false, blockedReason: 'BOOKS' },
            { id: 4, name: '3', bookCount: 0, canDelete: true, blockedReason: null },
          ],
        },
      ],
    },
    {
      id: 5,
      name: 'Dormitorio',
      bookCount: 0,
      canDelete: false,
      blockedReason: 'BOOKCASES',
      bookcases: [
        { id: 6, name: 'Negra', bookCount: 0, canDelete: true, blockedReason: null, shelves: [] },
      ],
    },
  ];
}

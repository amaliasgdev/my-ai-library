package com.mibiblioteca.bookservice.location;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LocationServiceTest {
    @Mock RoomRepository rooms;
    @Mock BookcaseRepository bookcases;
    @Mock ShelfRepository shelves;
    @Mock BookRepository books;
    @InjectMocks LocationService service;

    @Test void createNormalizesButNeverRepairsOrTruncates() {
        when(rooms.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.createRoom(" \u00a0Salón  / nº 2\u00a0 ").name()).isEqualTo("Salón  / nº 2");
        for (String invalid : new String[]{"\u00a0", "a\nb", " " + "x".repeat(100)}) assertThatThrownBy(() -> service.createRoom(invalid)).isInstanceOf(LocationException.class);
        verify(rooms, times(1)).saveAndFlush(any());
    }
    @Test void missingParentPreventsCreatingChild() {
        when(rooms.findById(1L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.createBookcase(1L, "Billy")).isInstanceOf(LocationException.class);
        verifyNoInteractions(bookcases);
    }
    @Test void childPresenceBlocksDeletingRoomBeforeAnyDelete() {
        when(rooms.findById(1L)).thenReturn(Optional.of(new Room())); when(bookcases.existsByRoomId(1L)).thenReturn(true);
        assertThatThrownBy(() -> service.deleteRoom(1L)).isInstanceOf(LocationException.class); verify(rooms, never()).delete(any());
    }
}

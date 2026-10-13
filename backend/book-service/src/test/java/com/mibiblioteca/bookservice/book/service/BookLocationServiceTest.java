package com.mibiblioteca.bookservice.book.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.cover.CoverLifecycle;
import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BookLocationServiceTest {
    @Mock private CoverLifecycle covers;
    @Mock private BookRepository repository;
    @Mock private com.mibiblioteca.bookservice.location.LocationService locations;
    @Spy private IsbnNormalizer isbnNormalizer = new IsbnNormalizer();
    @InjectMocks private BookService service;

    @Test void createAndUpdateShareNormalizationPreservingInnerSpacesAndCase() {
        when(repository.save(any(Book.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var created = service.create(request(" \u00a0Salón\u00a0 ", " Billy  izquierda / nº 2 ", " Superior "));
        assertThat(created.room()).isEqualTo("Salón"); assertThat(created.bookcase()).isEqualTo("Billy  izquierda / nº 2"); assertThat(created.shelf()).isEqualTo("Superior");
        Book book = new Book(); when(repository.findById(1L)).thenReturn(Optional.of(book));
        var changed = service.update(1L, request(" Dormitorio ", null, " 3 "));
        assertThat(changed.room()).isEqualTo("Dormitorio"); assertThat(changed.bookcase()).isNull(); assertThat(changed.shelf()).isEqualTo("3");
        var cleared = service.update(1L, request(null, "   ", "\u00a0"));
        assertThat(cleared.room()).isNull(); assertThat(cleared.bookcase()).isNull(); assertThat(cleared.shelf()).isNull();
    }

    private BookRequest request(String room, String bookcase, String shelf) {
        return new BookRequest("Book", "Author", null, null, null, null, null, null, null, List.of(), room, bookcase, shelf);
    }

    @Test void structuredAssignmentClearsLegacyAndResponseDerivesNamesFromTheRelation() {
        var room = new com.mibiblioteca.bookservice.location.Room(); room.setName("Salón");
        var bookcase = new com.mibiblioteca.bookservice.location.Bookcase(); bookcase.setName("Billy"); bookcase.setRoom(room);
        var shelf = new com.mibiblioteca.bookservice.location.Shelf(); shelf.setName("Superior"); shelf.setBookcase(bookcase);
        var book = new Book(); book.setRoom("Old"); book.setShelf("3");
        when(repository.findById(1L)).thenReturn(Optional.of(book)); when(locations.shelf(42L)).thenReturn(shelf);
        when(repository.saveAndFlush(any(Book.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var response = service.updateLocation(1L, new com.mibiblioteca.bookservice.book.dto.UpdateBookLocationRequest(42L));
        assertThat(book.getAssignedShelf()).isSameAs(shelf); assertThat(book.getRoom()).isNull(); assertThat(book.getShelf()).isNull();
        assertThat(response.room()).isEqualTo("Salón"); assertThat(response.bookcase()).isEqualTo("Billy"); assertThat(response.shelf()).isEqualTo("Superior"); assertThat(response.locationPending()).isFalse();
        service.updateLocation(1L, new com.mibiblioteca.bookservice.book.dto.UpdateBookLocationRequest(null));
        assertThat(book.getAssignedShelf()).isNull(); assertThat(book.getRoom()).isNull();
    }
}

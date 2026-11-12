package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.MoveSagaVolumeRequest;
import com.mibiblioteca.bookservice.saga.SagaDtos.UnlinkSagaVolumeRequest;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class SagaVolumeServiceTest {

    @Mock private SagaRepository sagas;
    @Mock private SagaVolumeRepository volumes;
    @Mock private BookRepository books;
    @Mock private JdbcTemplate jdbc;

    @InjectMocks private SagaVolumeService service;

    @Test
    void addRejectsBothTargetsBeforeWriting() {
        assertThatThrownBy(() -> service.add(1L, new AddSagaVolumeRequest(5L, "Título", null, "0")))
            .isInstanceOfSatisfying(SagaException.class,
                exception -> assertThat(exception.code()).isEqualTo("SAGA_VOLUME_TARGET_CONFLICT"));

        verify(volumes, never()).saveAndFlush(any(SagaVolume.class));
    }

    @Test
    void addRequiresABookOrAPendingTitle() {
        assertThatThrownBy(() -> service.add(1L, new AddSagaVolumeRequest(null, "   ", null, "0")))
            .isInstanceOfSatisfying(SagaException.class,
                exception -> assertThat(exception.code()).isEqualTo("SAGA_VOLUME_TARGET_REQUIRED"));

        verifyNoInteractions(books);
        verify(volumes, never()).saveAndFlush(any(SagaVolume.class));
    }

    @Test
    void addAppendsAtTheEndAndIncrementsTheRevision() {
        when(sagas.findByIdForUpdate(1L)).thenReturn(Optional.of(saga(1L, 2)));
        when(volumes.countBySagaId(1L)).thenReturn(2L);
        when(volumes.saveAndFlush(any(SagaVolume.class))).thenAnswer(invocation -> {
            SagaVolume volume = invocation.getArgument(0);
            volume.setId(9L);
            return volume;
        });

        var response = service.add(1L, new AddSagaVolumeRequest(null, "  Pendiente  ", "0.5", "2"));

        assertThat(response.revision()).isEqualTo("3");
        assertThat(response.volume().id()).isEqualTo(9L);
        assertThat(response.volume().position()).isEqualTo(3);
        assertThat(response.volume().pendingTitle()).isEqualTo("Pendiente");
        assertThat(response.volume().volumeLabel()).isEqualTo("0.5");
        assertThat(response.volume().bookId()).isNull();
    }

    @Test
    void unlinkDefaultsToTheBookTitleAndPreservesIdentityPositionAndLabel() {
        when(sagas.findByIdForUpdate(1L)).thenReturn(Optional.of(saga(1L, 1)));
        Book book = book(7L, "Título actual");
        SagaVolume volume = new SagaVolume(saga(1L, 0), book, null, 3, "2");
        volume.setId(11L);
        when(volumes.findByIdAndSagaId(11L, 1L)).thenReturn(Optional.of(volume));

        var response = service.unlink(1L, 11L, new UnlinkSagaVolumeRequest(null, "1"));

        assertThat(response.revision()).isEqualTo("2");
        assertThat(response.volume().id()).isEqualTo(11L);
        assertThat(response.volume().position()).isEqualTo(3);
        assertThat(response.volume().volumeLabel()).isEqualTo("2");
        assertThat(response.volume().bookId()).isNull();
        assertThat(response.volume().book()).isNull();
        assertThat(response.volume().pendingTitle()).isEqualTo("Título actual");
        verify(volumes).flush();
    }

    @Test
    void moveToTheSamePositionIsANoOpWithoutIncrementingOrQuerying() {
        when(sagas.findByIdForUpdate(1L)).thenReturn(Optional.of(saga(1L, 4)));
        SagaVolume volume = new SagaVolume(saga(1L, 0), null, "Pendiente", 2, null);
        volume.setId(11L);
        when(volumes.findByIdAndSagaId(11L, 1L)).thenReturn(Optional.of(volume));
        when(volumes.countBySagaId(1L)).thenReturn(3L);

        var response = service.move(1L, 11L, new MoveSagaVolumeRequest(2, "4"));

        assertThat(response.revision()).isEqualTo("4");
        assertThat(response.position()).isEqualTo(2);
        verifyNoInteractions(jdbc);
        verify(volumes, never()).flush();
    }

    private Saga saga(long id, long revision) {
        Saga saga = new Saga("Saga", null, null, null);
        saga.setId(id);
        saga.setRevision(revision);
        return saga;
    }

    private Book book(long id, String title) {
        Book book = new Book();
        book.setId(id);
        book.setTitle(title);
        book.setAuthor("Autora");
        book.setReadingStatus(ReadingStatus.READ);
        return book;
    }
}

package com.mibiblioteca.bookservice.saga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import com.mibiblioteca.bookservice.saga.SagaDtos.SagaProgressResponse;
import com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

@ExtendWith(MockitoExtension.class)
class SagaServiceTest {

    @Mock private SagaRepository repository;
    @Mock private SagaVolumeRepository volumes;
    @Mock private SagaProgressService progressService;

    @InjectMocks private SagaService service;

    @Test
    void createTrimsNameAndAuthorAndReturnsZeroProgress() {
        when(repository.saveAndFlush(any(Saga.class))).thenAnswer(invocation -> {
            Saga saga = invocation.getArgument(0);
            saga.setId(7L);
            return saga;
        });

        var response = service.create(new SagaRequest("  Saga  ", "  Autora  ", "Descripción",
            "https://example.com/saga.jpg"));

        assertThat(response.id()).isEqualTo(7L);
        assertThat(response.name()).isEqualTo("Saga");
        assertThat(response.author()).isEqualTo("Autora");
        assertThat(response.description()).isEqualTo("Descripción");
        assertThat(response.imageUrl()).isEqualTo("https://example.com/saga.jpg");
        assertThat(response.revision()).isEqualTo("0");
        assertThat(response.progress().total()).isZero();
        assertThat(response.progress().linked()).isZero();
        assertThat(response.progress().pending()).isZero();
    }

    @Test
    void createStoresBlankAuthorAsNull() {
        when(repository.saveAndFlush(any(Saga.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(new SagaRequest("Saga", "   ", null, null));

        assertThat(response.author()).isNull();
    }

    @Test
    void findByIdReturnsNotFoundWhenMissing() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findById(99L))
            .isInstanceOfSatisfying(SagaException.class, exception -> {
                assertThat(exception.status().value()).isEqualTo(404);
                assertThat(exception.code()).isEqualTo("SAGA_NOT_FOUND");
            });
    }

    @Test
    void updateLocksTheSagaAndRejectsAStaleRevisionBeforeWriting() {
        Saga saga = saga(1L, 2);
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(saga));

        assertThatThrownBy(() -> service.update(1L, request("Cambiada"), "1"))
            .isInstanceOfSatisfying(SagaException.class, exception -> {
                assertThat(exception.status().value()).isEqualTo(409);
                assertThat(exception.code()).isEqualTo("SAGA_REVISION_CONFLICT");
            });

        verify(repository).findByIdForUpdate(1L);
        verify(repository, never()).flush();
        assertThat(saga.getName()).isEqualTo("Original");
        assertThat(saga.getRevision()).isEqualTo(2);
    }

    @Test
    void updateAppliesChangesAndIncrementsRevisionOnce() {
        Saga saga = saga(1L, 2);
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(saga));
        when(progressService.forSaga(1L)).thenReturn(SagaProgressResponse.zero());

        var response = service.update(1L, request("  Cambiada  "), "2");

        assertThat(response.name()).isEqualTo("Cambiada");
        assertThat(response.revision()).isEqualTo("3");
        verify(repository).flush();
    }

    @Test
    void deleteLocksTheSagaAndRejectsAStaleRevision() {
        Saga saga = saga(1L, 4);
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(saga));

        assertThatThrownBy(() -> service.delete(1L, "3"))
            .isInstanceOfSatisfying(SagaException.class,
                exception -> assertThat(exception.code()).isEqualTo("SAGA_REVISION_CONFLICT"));

        verify(repository, never()).delete(any(Saga.class));
    }

    @Test
    void deleteRemovesTheLockedSaga() {
        Saga saga = saga(1L, 4);
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(saga));

        service.delete(1L, "4");

        verify(repository).delete(saga);
    }

    @Test
    void listRejectsUnknownSortFieldsBeforeAccessingTheDatabase() {
        assertThatThrownBy(() -> service.findAll(0, 20, "isbn", Sort.Direction.ASC, null))
            .isInstanceOf(InvalidSortParameterException.class);

        verifyNoInteractions(repository);
    }

    @Test
    void rejectsUnparseableRevisions() {
        assertThatThrownBy(() -> service.delete(1L, "01"))
            .isInstanceOfSatisfying(SagaException.class,
                exception -> assertThat(exception.code()).isEqualTo("SAGA_INVALID_REQUEST"));

        verifyNoInteractions(repository);
    }

    private Saga saga(long id, long revision) {
        Saga saga = new Saga("Original", "Autora", null, null);
        saga.setId(id);
        saga.setRevision(revision);
        return saga;
    }

    private SagaRequest request(String name) {
        return new SagaRequest(name, null, null, null);
    }
}

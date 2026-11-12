package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.AddSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.BookSagaResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.LinkSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.MoveSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaRevisionResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeBookResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeMoveResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeMutationResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumeResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaVolumesResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.UnlinkSagaVolumeRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.UpdateSagaVolumeRequest;

import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SagaVolumeService {

    private static final String DEFERRED_POSITION_CONSTRAINT = "public.uq_saga_volume_position";

    private final SagaRepository sagas;
    private final SagaVolumeRepository volumes;
    private final BookRepository books;
    private final SagaProgressService progress;
    private final JdbcTemplate jdbc;

    public SagaVolumeService(SagaRepository sagas, SagaVolumeRepository volumes,
                             BookRepository books, SagaProgressService progress, JdbcTemplate jdbc) {
        this.sagas = sagas;
        this.volumes = volumes;
        this.books = books;
        this.progress = progress;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public SagaVolumesResponse findAll(Long sagaId) {
        Saga saga = sagas.findById(sagaId).orElseThrow(SagaException::notFound);
        List<SagaVolume> ordered = volumes.findDetailedBySagaIdOrderByPosition(sagaId);
        return new SagaVolumesResponse(Long.toString(saga.getRevision()), progress.forSaga(sagaId),
            ordered.stream().map(this::toResponse).toList());
    }

    @Transactional(readOnly = true)
    public List<BookSagaResponse> findSagasForBook(Long bookId) {
        if (!books.existsById(bookId)) {
            throw new BookNotFoundException(bookId);
        }
        return volumes.findByBookIdWithSagaOrderByName(bookId).stream()
            .map(volume -> new BookSagaResponse(
                volume.getSaga().getId(),
                volume.getSaga().getName(),
                volume.getId(),
                volume.getPosition(),
                volume.getVolumeLabel()
            ))
            .toList();
    }

    @Transactional
    public SagaVolumeMutationResponse add(Long sagaId, AddSagaVolumeRequest request) {
        long expected = SagaParameters.revision(request.expectedRevision());
        String pendingTitle = trimToNull(request.pendingTitle());
        String label = trimToNull(request.volumeLabel());
        Book book = null;
        if (request.bookId() != null) {
            if (pendingTitle != null) {
                throw SagaException.targetConflict();
            }
            // Book share is acquired before the saga lock to keep delete order book -> saga.
            book = books.findForSagaLink(request.bookId()).orElseThrow(SagaException::bookNotFound);
        } else if (pendingTitle == null) {
            throw SagaException.targetRequired();
        }
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId, expected);
        if (book != null && volumes.existsBySagaIdAndBookId(sagaId, book.getId())) {
            throw SagaException.duplicateBook();
        }

        long size = volumes.countBySagaId(sagaId);
        if (size >= Integer.MAX_VALUE) {
            throw SagaException.capacityExceeded();
        }
        SagaVolume volume = new SagaVolume(saga, book, pendingTitle, (int) size + 1, label);
        volumes.saveAndFlush(volume);
        SagaRevisions.increment(saga);
        sagas.flush();
        return new SagaVolumeMutationResponse(Long.toString(saga.getRevision()), toResponse(volume));
    }

    @Transactional
    public SagaVolumeMutationResponse update(Long sagaId, Long volumeId, UpdateSagaVolumeRequest request) {
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId,
            SagaParameters.revision(request.expectedRevision()));
        SagaVolume volume = findVolume(sagaId, volumeId);
        String label = trimToNull(request.volumeLabel());
        String pendingTitle = trimToNull(request.pendingTitle());
        if (volume.getBook() == null) {
            if (pendingTitle == null) {
                throw SagaException.targetRequired();
            }
        } else if (pendingTitle != null) {
            throw SagaException.targetConflict();
        }

        boolean changed = !Objects.equals(volume.getVolumeLabel(), label)
            || (volume.getBook() == null && !Objects.equals(volume.getPendingTitle(), pendingTitle));
        if (changed) {
            volume.setVolumeLabel(label);
            if (volume.getBook() == null) {
                volume.setPendingTitle(pendingTitle);
            }
            SagaRevisions.increment(saga);
            volumes.flush();
            sagas.flush();
        }
        return new SagaVolumeMutationResponse(Long.toString(saga.getRevision()), toResponse(volume));
    }

    @Transactional
    public SagaVolumeMoveResponse move(Long sagaId, Long volumeId, MoveSagaVolumeRequest request) {
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId,
            SagaParameters.revision(request.expectedRevision()));
        SagaVolume volume = findVolume(sagaId, volumeId);
        int target = request.toPosition();
        int count = (int) volumes.countBySagaId(sagaId);
        if (target < 1 || target > count) {
            throw SagaException.invalidPosition();
        }
        int previous = volume.getPosition();
        if (target != previous) {
            jdbc.execute("SET CONSTRAINTS " + DEFERRED_POSITION_CONSTRAINT + " DEFERRED");
            // Fetch before changing managed positions: query auto-flush must not
            // change which rows belong to the original affected interval.
            var affected = volumes.findBySagaIdAndPositionBetweenOrderByPositionAsc(
                sagaId, Math.min(previous, target), Math.max(previous, target));
            int shift = target < previous ? 1 : -1;
            affected.stream().filter(other -> !other.getId().equals(volume.getId()))
                .forEach(other -> other.setPosition(other.getPosition() + shift));
            volume.setPosition(target);
            SagaRevisions.increment(saga);
            volumes.flush();
            sagas.flush();
            jdbc.execute("SET CONSTRAINTS " + DEFERRED_POSITION_CONSTRAINT + " IMMEDIATE");
        }
        return new SagaVolumeMoveResponse(Long.toString(saga.getRevision()), volume.getId(), volume.getPosition());
    }

    @Transactional
    public SagaRevisionResponse remove(Long sagaId, Long volumeId, String expectedRevision) {
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId, SagaParameters.revision(expectedRevision));
        SagaVolume volume = findVolume(sagaId, volumeId);
        jdbc.execute("SET CONSTRAINTS " + DEFERRED_POSITION_CONSTRAINT + " DEFERRED");
        int position = volume.getPosition();
        volumes.delete(volume);
        volumes.findBySagaIdAndPositionGreaterThanOrderByPositionAsc(sagaId, position)
            .forEach(later -> later.setPosition(later.getPosition() - 1));
        SagaRevisions.increment(saga);
        volumes.flush();
        sagas.flush();
        jdbc.execute("SET CONSTRAINTS " + DEFERRED_POSITION_CONSTRAINT + " IMMEDIATE");
        return new SagaRevisionResponse(Long.toString(saga.getRevision()));
    }

    @Transactional
    public SagaVolumeMutationResponse link(Long sagaId, Long volumeId, LinkSagaVolumeRequest request) {
        long expected = SagaParameters.revision(request.expectedRevision());
        Book book = books.findForSagaLink(request.bookId()).orElseThrow(SagaException::bookNotFound);
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId, expected);
        SagaVolume volume = findVolume(sagaId, volumeId);
        if (volume.getBook() != null) {
            if (volume.getBook().getId().equals(request.bookId())) {
                return new SagaVolumeMutationResponse(Long.toString(saga.getRevision()), toResponse(volume));
            }
            throw SagaException.alreadyLinked();
        }
        if (volumes.existsBySagaIdAndBookId(sagaId, book.getId())) {
            throw SagaException.duplicateBook();
        }
        volume.setBook(book);
        volume.setPendingTitle(null);
        SagaRevisions.increment(saga);
        volumes.flush();
        sagas.flush();
        return new SagaVolumeMutationResponse(Long.toString(saga.getRevision()), toResponse(volume));
    }

    @Transactional
    public SagaVolumeMutationResponse unlink(Long sagaId, Long volumeId, UnlinkSagaVolumeRequest request) {
        Saga saga = SagaRevisions.lockAndCheck(sagas, sagaId,
            SagaParameters.revision(request.expectedRevision()));
        SagaVolume volume = findVolume(sagaId, volumeId);
        if (volume.getBook() == null) {
            throw SagaException.notLinked();
        }
        String title = trimToNull(request.pendingTitle());
        if (title == null) {
            title = volume.getBook().getTitle();
        }
        volume.setBook(null);
        volume.setPendingTitle(title);
        SagaRevisions.increment(saga);
        volumes.flush();
        sagas.flush();
        return new SagaVolumeMutationResponse(Long.toString(saga.getRevision()), toResponse(volume));
    }

    /**
     * Joins Book.delete's transaction. Lock order is always reading_list -> book -> saga,
     * so the affected sagas are locked in ascending id order after the book lock.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void detachBookBeforeDeletion(long bookId) {
        List<Long> sagaIds = volumes.findDistinctSagaIdsByBookId(bookId).stream().sorted().toList();
        Map<Long, Saga> locked = new HashMap<>();
        for (Long sagaId : sagaIds) {
            sagas.findByIdForUpdate(sagaId).ifPresent(saga -> locked.put(sagaId, saga));
        }
        Book book = books.findById(bookId).orElse(null);
        if (book == null) {
            return;
        }
        List<SagaVolume> affected = volumes.findByBookIdOrderBySagaIdAsc(bookId);
        if (affected.isEmpty()) {
            return;
        }
        Set<Long> incremented = new HashSet<>();
        for (SagaVolume volume : affected) {
            Long sagaId = volume.getSaga().getId();
            Saga saga = locked.get(sagaId);
            if (saga != null && incremented.add(sagaId)) {
                SagaRevisions.increment(saga);
            }
            volume.setBook(null);
            volume.setPendingTitle(book.getTitle());
        }
        volumes.flush();
        sagas.flush();
    }

    private SagaVolume findVolume(Long sagaId, Long volumeId) {
        return volumes.findByIdAndSagaId(volumeId, sagaId).orElseThrow(SagaException::volumeNotFound);
    }

    private SagaVolumeResponse toResponse(SagaVolume volume) {
        Book book = volume.getBook();
        SagaVolumeBookResponse bookResponse = book == null ? null : new SagaVolumeBookResponse(
            book.getId(),
            book.getTitle(),
            book.getAuthor(),
            book.getCoverUrl(),
            book.getReadingStatus(),
            book.getRating(),
            book.getFinishedOn()
        );
        return new SagaVolumeResponse(
            volume.getId(),
            volume.getPosition(),
            volume.getVolumeLabel(),
            book == null ? null : book.getId(),
            bookResponse,
            volume.getPendingTitle(),
            volume.getCreatedAt(),
            volume.getUpdatedAt()
        );
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

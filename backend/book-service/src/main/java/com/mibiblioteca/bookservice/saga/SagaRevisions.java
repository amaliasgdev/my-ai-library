package com.mibiblioteca.bookservice.saga;

/** Shared saga row locking and revision rules for metadata and volume writes. */
final class SagaRevisions {
    private SagaRevisions() {
    }

    static Saga lockAndCheck(SagaRepository sagas, Long id, long expectedRevision) {
        Saga saga = sagas.findByIdForUpdate(id).orElseThrow(SagaException::notFound);
        if (saga.getRevision() != expectedRevision) {
            throw SagaException.revisionConflict();
        }
        return saga;
    }

    static void increment(Saga saga) {
        if (saga.getRevision() == Long.MAX_VALUE) {
            throw SagaException.revisionExhausted();
        }
        saga.setRevision(saga.getRevision() + 1);
    }
}

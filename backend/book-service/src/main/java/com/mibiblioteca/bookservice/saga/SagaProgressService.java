package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaProgressResponse;
import static java.util.stream.Collectors.toMap;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Single source of truth for saga progress. Counters are always derived from the
 * current saga_volume rows and the referenced Book.readingStatus; nothing is persisted.
 */
@Service
public class SagaProgressService {

    private final SagaVolumeRepository volumes;

    public SagaProgressService(SagaVolumeRepository volumes) {
        this.volumes = volumes;
    }

    @Transactional(readOnly = true)
    public SagaProgressResponse forSaga(Long sagaId) {
        return forSagas(List.of(sagaId)).getOrDefault(sagaId, SagaProgressResponse.zero());
    }

    @Transactional(readOnly = true)
    public Map<Long, SagaProgressResponse> forSagas(Collection<Long> sagaIds) {
        if (sagaIds.isEmpty()) {
            return Map.of();
        }
        return volumes.findProgressBySagaIds(sagaIds).stream()
            .collect(toMap(SagaVolumeRepository.Progress::getSagaId, this::toResponse));
    }

    private SagaProgressResponse toResponse(SagaVolumeRepository.Progress row) {
        int total = (int) row.getTotal();
        int linked = (int) row.getLinked();
        return new SagaProgressResponse(
            total,
            linked,
            total - linked,
            (int) row.getRead(),
            (int) row.getReading(),
            (int) row.getToRead(),
            (int) row.getAbandoned()
        );
    }
}

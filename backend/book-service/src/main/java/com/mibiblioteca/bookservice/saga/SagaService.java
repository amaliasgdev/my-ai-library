package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaPageResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaProgressResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaResponse;
import static java.util.stream.Collectors.toMap;

import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SagaService {

    private final SagaRepository repository;
    private final SagaVolumeRepository volumes;

    public SagaService(SagaRepository repository, SagaVolumeRepository volumes) {
        this.repository = repository;
        this.volumes = volumes;
    }

    @Transactional(readOnly = true)
    public SagaPageResponse findAll(int page, int size, String sortBy, Sort.Direction direction, String name) {
        var pageable = PageRequest.of(page, size, createSort(sortBy, direction));
        String normalizedName = normalizeNameFilter(name);
        Page<Saga> sagas = normalizedName == null
            ? repository.findAll(pageable)
            : repository.findByNameContainingIgnoreCase(normalizedName, pageable);
        Map<Long, SagaProgressResponse> progress = progressBySaga(
            sagas.getContent().stream().map(Saga::getId).toList());
        return new SagaPageResponse(
            sagas.getContent().stream()
                .map(saga -> toResponse(saga, progress.getOrDefault(saga.getId(), SagaProgressResponse.zero())))
                .toList(),
            sagas.getNumber(),
            sagas.getSize(),
            sagas.getTotalElements(),
            sagas.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public SagaResponse findById(Long id) {
        Saga saga = find(id);
        return toResponse(saga, progress(id));
    }

    @Transactional(readOnly = true)
    public SagaProgressResponse progress(Long sagaId) {
        return progressBySaga(List.of(sagaId)).getOrDefault(sagaId, SagaProgressResponse.zero());
    }

    @Transactional
    public SagaResponse create(SagaRequest request) {
        Saga saga = new Saga(normalizeRequired(request.name()), trimToNull(request.author()),
            request.description(), request.imageUrl());
        repository.saveAndFlush(saga);
        return toResponse(saga, SagaProgressResponse.zero());
    }

    @Transactional
    public SagaResponse update(Long id, SagaRequest request, String expectedRevision) {
        Saga saga = SagaRevisions.lockAndCheck(repository, id, SagaParameters.revision(expectedRevision));
        apply(saga, request);
        SagaRevisions.increment(saga);
        repository.flush();
        return toResponse(saga, progress(id));
    }

    @Transactional
    public void delete(Long id, String expectedRevision) {
        Saga saga = SagaRevisions.lockAndCheck(repository, id, SagaParameters.revision(expectedRevision));
        volumes.deleteAll(volumes.findBySagaIdOrderByPositionAsc(id));
        volumes.flush();
        repository.delete(saga);
        repository.flush();
    }

    private Saga find(Long id) {
        return repository.findById(id).orElseThrow(SagaException::notFound);
    }

    private Map<Long, SagaProgressResponse> progressBySaga(Collection<Long> sagaIds) {
        if (sagaIds.isEmpty()) {
            return Map.of();
        }
        return volumes.findProgressBySagaIds(sagaIds).stream().collect(toMap(
            SagaVolumeRepository.Progress::getSagaId,
            row -> new SagaProgressResponse(
                (int) row.getTotal(),
                (int) row.getLinked(),
                (int) (row.getTotal() - row.getLinked()),
                (int) row.getRead(),
                (int) row.getReading(),
                (int) row.getToRead(),
                (int) row.getAbandoned()
            )
        ));
    }

    private void apply(Saga saga, SagaRequest request) {
        saga.setName(normalizeRequired(request.name()));
        saga.setAuthor(trimToNull(request.author()));
        saga.setDescription(request.description());
        saga.setImageUrl(request.imageUrl());
    }

    private String normalizeRequired(String value) {
        return value.trim();
    }

    private String normalizeNameFilter(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Sort createSort(String sortBy, Sort.Direction direction) {
        if (!isAllowedSortBy(sortBy)) {
            throw new InvalidSortParameterException(sortBy);
        }
        return Sort.by(direction, sortBy).and(Sort.by(Sort.Direction.ASC, "id"));
    }

    private boolean isAllowedSortBy(String sortBy) {
        return switch (sortBy) {
            case "name", "author", "createdAt", "updatedAt" -> true;
            default -> false;
        };
    }

    private SagaResponse toResponse(Saga saga, SagaProgressResponse progress) {
        return new SagaResponse(
            saga.getId(),
            saga.getName(),
            saga.getAuthor(),
            saga.getDescription(),
            saga.getImageUrl(),
            Long.toString(saga.getRevision()),
            saga.getCreatedAt(),
            saga.getUpdatedAt(),
            progress
        );
    }
}

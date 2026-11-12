package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaPageResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaProgressResponse;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaRequest;
import static com.mibiblioteca.bookservice.saga.SagaDtos.SagaResponse;

import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SagaService {

    private final SagaRepository repository;

    public SagaService(SagaRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public SagaPageResponse findAll(int page, int size, String sortBy, Sort.Direction direction, String name) {
        var pageable = PageRequest.of(page, size, createSort(sortBy, direction));
        String normalizedName = normalizeNameFilter(name);
        Page<Saga> sagas = normalizedName == null
            ? repository.findAll(pageable)
            : repository.findByNameContainingIgnoreCase(normalizedName, pageable);
        return new SagaPageResponse(
            sagas.getContent().stream().map(this::toResponse).toList(),
            sagas.getNumber(),
            sagas.getSize(),
            sagas.getTotalElements(),
            sagas.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public SagaResponse findById(Long id) {
        return toResponse(find(id));
    }

    @Transactional
    public SagaResponse create(SagaRequest request) {
        Saga saga = new Saga(normalizeRequired(request.name()), trimToNull(request.author()),
            request.description(), request.imageUrl());
        repository.saveAndFlush(saga);
        return toResponse(saga);
    }

    @Transactional
    public SagaResponse update(Long id, SagaRequest request, String expectedRevision) {
        Saga saga = lockAndCheck(id, SagaParameters.revision(expectedRevision));
        apply(saga, request);
        increment(saga);
        repository.flush();
        return toResponse(saga);
    }

    @Transactional
    public void delete(Long id, String expectedRevision) {
        Saga saga = lockAndCheck(id, SagaParameters.revision(expectedRevision));
        repository.delete(saga);
    }

    private Saga find(Long id) {
        return repository.findById(id).orElseThrow(SagaException::notFound);
    }

    private Saga lockAndCheck(Long id, long expectedRevision) {
        Saga saga = repository.findByIdForUpdate(id).orElseThrow(SagaException::notFound);
        if (saga.getRevision() != expectedRevision) {
            throw SagaException.revisionConflict();
        }
        return saga;
    }

    private void apply(Saga saga, SagaRequest request) {
        saga.setName(normalizeRequired(request.name()));
        saga.setAuthor(trimToNull(request.author()));
        saga.setDescription(request.description());
        saga.setImageUrl(request.imageUrl());
    }

    private void increment(Saga saga) {
        if (saga.getRevision() == Long.MAX_VALUE) {
            throw SagaException.revisionExhausted();
        }
        saga.setRevision(saga.getRevision() + 1);
    }

    /** Mirrors the unique index: outer spaces and case are irrelevant. */
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

    private SagaResponse toResponse(Saga saga) {
        return new SagaResponse(
            saga.getId(),
            saga.getName(),
            saga.getAuthor(),
            saga.getDescription(),
            saga.getImageUrl(),
            Long.toString(saga.getRevision()),
            saga.getCreatedAt(),
            saga.getUpdatedAt(),
            SagaProgressResponse.zero()
        );
    }
}

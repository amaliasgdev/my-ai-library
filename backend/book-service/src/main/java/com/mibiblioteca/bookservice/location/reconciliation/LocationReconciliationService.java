package com.mibiblioteca.bookservice.location.reconciliation;

import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LocationReconciliationService {
    private final LocationReconciliationRepository repository;
    private final ReviewToken tokens;
    public LocationReconciliationService(LocationReconciliationRepository repository, ReviewToken tokens) {
        this.repository = repository;
        this.tokens = tokens;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public GroupsPage groups(int page, int size, Type type, String text) {
        return repository.groups(page, size, type, text == null ? "" : text.trim());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(String key, int page, int size) {
        var canonical = repository.canonical(key);
        var books = repository.members(canonical, false);
        if (books.isEmpty()) throw ReconciliationException.missing();

        var counts = new LinkedHashMap<List<String>, Long>();
        for (var book : books) {
            counts.merge(Arrays.asList(book.room(), book.bookcase(), book.shelf()), 1L, Long::sum);
        }
        var variants = counts.entrySet().stream()
            .map(entry -> new Variant(entry.getKey().get(0), entry.getKey().get(1), entry.getKey().get(2), entry.getValue()))
            .toList();
        var first = books.getFirst();
        var suggestions = repository.suggestions(canonical);
        boolean complete = canonical.room() != null && canonical.bookcase() != null && canonical.shelf() != null;
        var group = new Group(key, first.room(), first.bookcase(), first.shelf(), variants.size(), books.size(),
            complete ? Type.COMPLETE : Type.PARTIAL, repository.match(complete, suggestions.size()),
            suggestions.size() == 1 ? suggestions.getFirst() : null);
        var snapshot = tokens.snapshot(key, books);
        int start = (int) Math.min((long) page * size, books.size());
        int end = Math.min(start + size, books.size());
        return new Detail(group, variants, books.subList(start, end), page, size, books.size(),
            (books.size() + (long) size - 1) / size, tokens.sign(snapshot), snapshot.fingerprint(),
            books.size(), snapshot.expiresAt());
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ, timeout = 15)
    public Assigned assign(AssignRequest request) {
        var snapshot = tokens.verify(request.reviewToken());
        var canonical = repository.canonical(snapshot.canonicalGroupKey());
        var destination = repository.lockDestination(request.shelfId());
        var books = repository.members(canonical, true);
        if (books.size() != snapshot.expectedCount() || !tokens.fingerprint(books).equals(snapshot.fingerprint())) {
            throw ReconciliationException.stale();
        }
        if (!destination.labels().equals(request.expectedDestination())) {
            throw new ReconciliationException(HttpStatus.CONFLICT, "RECONCILIATION_DESTINATION_CHANGED",
                "Destination names changed. Reload and confirm again");
        }
        int affected = repository.assign(books, destination.shelfId());
        if (affected != snapshot.expectedCount()) throw ReconciliationException.stale();
        return new Assigned(affected, destination.shelfId());
    }
}

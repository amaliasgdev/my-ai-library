package com.mibiblioteca.bookservice.book.cover;

import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class CoverLifecycle {
    private static final Logger log = LoggerFactory.getLogger(CoverLifecycle.class);
    private final CoverUrls urls;
    private final CoverStorage storage;

    public CoverLifecycle(CoverUrls urls, CoverStorage storage) {
        this.urls = urls;
        this.storage = storage;
    }

    public void validateAssignment(Long id, String current, String proposed) {
        urls.validateAssignment(id, current, proposed);
    }

    public void afterCommit(Long id, String oldUrl, String newUrl) {
        if (Objects.equals(oldUrl, newUrl)) { return; }
        String filename = urls.ownedFilename(id, oldUrl);
        if (filename == null) { return; }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("Cover cleanup requires a transaction");
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { cleanup(filename); }
        });
    }

    public void cleanup(String filename) {
        try { storage.delete(filename); }
        catch (RuntimeException ex) {
            log.warn("Cover cleanup failed for managed file {} ({})", filename, ex.getClass().getSimpleName());
        }
    }
}

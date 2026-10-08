package com.mibiblioteca.bookservice.book.cover;

import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class BookCoverService {
    private static final Logger log = LoggerFactory.getLogger(BookCoverService.class);
    private final BookRepository repository;
    private final BookService books;
    private final CoverImageValidator validator;
    private final CoverStorage storage;
    private final CoverUrls urls;
    private final CoverLifecycle lifecycle;
    private final TransactionTemplate transaction;

    public BookCoverService(BookRepository repository, BookService books, CoverImageValidator validator,
        CoverStorage storage, CoverUrls urls, CoverLifecycle lifecycle, PlatformTransactionManager manager) {
        this.repository = repository;
        this.books = books;
        this.validator = validator;
        this.storage = storage;
        this.urls = urls;
        this.lifecycle = lifecycle;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public BookResponse upload(Long id, MultipartFile file) {
        if (!repository.existsById(id)) { throw new BookNotFoundException(id); }
        ValidatedCover image = validator.validate(file);
        String filename = storage.store(id, image);
        AtomicBoolean entered = new AtomicBoolean();
        AtomicBoolean rolledBack = new AtomicBoolean();
        try {
            return transaction.execute(status -> {
                entered.set(true);
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int completion) {
                        if (completion == STATUS_ROLLED_BACK) { rolledBack.set(true); }
                    }
                });
                Book book = findBook(id);
                String oldUrl = book.getCoverUrl();
                book.setCoverUrl(urls.publicUrl(filename));
                repository.saveAndFlush(book);
                lifecycle.afterCommit(id, oldUrl, book.getCoverUrl());
                return books.findById(id);
            });
        } catch (RuntimeException ex) {
            if (!entered.get() || rolledBack.get()) { lifecycle.cleanup(filename); }
            else { log.warn("Cover transaction outcome uncertain; retained managed file {}", filename); }
            if (ex instanceof BookNotFoundException || ex instanceof CoverException) { throw ex; }
            throw persistenceFailure();
        }
    }

    public void delete(Long id) {
        try {
            transaction.executeWithoutResult(status -> {
                Book book = findBook(id);
                String oldUrl = book.getCoverUrl();
                book.setCoverUrl(null);
                repository.saveAndFlush(book);
                lifecycle.afterCommit(id, oldUrl, null);
            });
        } catch (RuntimeException ex) {
            if (ex instanceof BookNotFoundException || ex instanceof CoverException) { throw ex; }
            throw persistenceFailure();
        }
    }

    private Book findBook(Long id) { return repository.findById(id).orElseThrow(() -> new BookNotFoundException(id)); }
    private CoverException persistenceFailure() {
        return new CoverException(HttpStatus.INTERNAL_SERVER_ERROR, "Cover association could not be persisted", null);
    }
}

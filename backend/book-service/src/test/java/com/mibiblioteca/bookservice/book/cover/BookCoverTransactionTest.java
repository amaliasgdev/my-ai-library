package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.nio.file.Path;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

class BookCoverTransactionTest {
    @Test
    void shouldRetainNewFileWhenCommitOutcomeIsUnknown() throws Exception {
        var manager = new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object tx, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { throw new TransactionSystemException("SECRET COMMIT"); }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        };
        var repository = mock(BookRepository.class);
        var books = mock(BookService.class);
        var storage = mock(CoverStorage.class);
        var properties = CoverTestImages.properties(Path.of("unused"));
        var urls = new CoverUrls(properties);
        var lifecycle = new CoverLifecycle(urls, storage);
        var service = new BookCoverService(repository, books, new CoverImageValidator(properties), storage, urls, lifecycle, manager);
        String filename = "1-00000000-0000-0000-0000-000000000000.png";
        Book book = new Book();
        book.setId(1L);
        when(repository.existsById(1L)).thenReturn(true);
        when(repository.findById(1L)).thenReturn(Optional.of(book));
        when(storage.store(any(), any())).thenReturn(filename);
        assertThatThrownBy(() -> service.upload(1L, CoverTestImages.png())).isInstanceOf(CoverException.class);
        verify(storage, never()).delete(filename);
    }
}

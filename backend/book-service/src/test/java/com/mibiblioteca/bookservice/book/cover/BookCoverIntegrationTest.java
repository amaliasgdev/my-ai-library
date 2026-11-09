package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
class BookCoverIntegrationTest {
    @TempDir static Path directory;
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("storage.covers.directory", () -> directory.toString());
    }

    @Autowired private BookService books;
    @Autowired private BookCoverService covers;
    @Autowired private CoverUrls urls;
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager manager;
    @MockitoSpyBean private FileSystemCoverStorage storage;
    @MockitoSpyBean private BookRepository repository;
    private final List<Long> created = new ArrayList<>();

    @AfterEach
    void cleanup() {
        reset(storage, repository);
        for (Long id : created) {
            if (repository.existsById(id)) { books.delete(id); }
        }
    }

    private Long book(String coverUrl) {
        Long id = books.create(request(coverUrl)).id();
        created.add(id);
        return id;
    }

    private BookRequest request(String coverUrl) {
        return new BookRequest("Cover test", "Author", null, "Description", coverUrl, "Publisher", 2001, 10, "es", List.of("Genre"));
    }

    private String upload(Long id) throws Exception {
        return urls.ownedFilename(id, covers.upload(id, CoverTestImages.png()).coverUrl());
    }

    @ParameterizedTest
    @CsvSource({"jpeg,image/jpeg,jpg", "png,image/png,png"})
    void shouldUploadFullBookAndServeExactBytesWithCanonicalHeaders(String format, String mime, String extension) throws Exception {
        Long id = book(null);
        byte[] bytes = CoverTestImages.image(format);
        mvc.perform(multipart("/api/books/{id}/cover", id).file(new MockMultipartFile("file", "../../wrong.svg", mime, bytes)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.title").value("Cover test")).andExpect(jsonPath("$.publisher").value("Publisher"))
            .andExpect(jsonPath("$.language").value("es")).andExpect(jsonPath("$.genres[0]").value("Genre"));
        String url = books.findById(id).coverUrl();
        String filename = urls.ownedFilename(id, url);
        assertThat(filename).endsWith("." + extension);
        assertThat(jdbc.queryForObject("SELECT cover_url FROM book WHERE id=?", String.class, id)).isEqualTo(url);
        mvc.perform(get("/api/covers/{filename}", filename)).andExpect(status().isOk())
            .andExpect(content().bytes(bytes)).andExpect(content().contentType(mime))
            .andExpect(header().longValue("Content-Length", bytes.length))
            .andExpect(header().string("Cache-Control", "max-age=86400, public"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("Content-Disposition", "inline; filename=\"" + filename + "\""));
    }

    @Test
    void shouldReplaceThenDeleteAndRemainIdempotent() throws Exception {
        Long id = book(null);
        String old = upload(id);
        String current = upload(id);
        assertThat(directory.resolve(old)).doesNotExist();
        assertThat(directory.resolve(current)).exists();
        mvc.perform(delete("/api/books/{id}/cover", id)).andExpect(status().isNoContent());
        assertThat(books.findById(id).coverUrl()).isNull();
        assertThat(directory.resolve(current)).doesNotExist();
        mvc.perform(delete("/api/books/{id}/cover", id)).andExpect(status().isNoContent());
    }

    @Test
    void shouldDeleteSuccessfullyWhenPhysicalFileIsAlreadyMissing() throws Exception {
        Long id = book(null);
        String filename = upload(id);
        storage.delete(filename);
        mvc.perform(delete("/api/books/{id}/cover", id)).andExpect(status().isNoContent());
        assertThat(books.findById(id).coverUrl()).isNull();
    }

    @Test
    void shouldReplaceAndClearExternalCoversWithoutStorageDeletion() throws Exception {
        Long id = book("https://covers.openlibrary.org/b/id/123-L.jpg");
        doAnswer(invocation -> { throw new AssertionError("No managed file should be deleted for an external URL"); }).when(storage).delete(anyString());
        String filename = upload(id);
        assertThat(directory.resolve(filename)).exists();
        reset(storage);
        Long external = book("https://example.com/external.png");
        doAnswer(invocation -> { throw new AssertionError("External cover must not be deleted"); }).when(storage).delete(anyString());
        covers.delete(external);
        assertThat(books.findById(external).coverUrl()).isNull();
    }

    @Test
    void shouldRejectMissingBookWithoutWritingAndHandleMissingPart() throws Exception {
        mvc.perform(multipart("/api/books/{id}/cover", Long.MAX_VALUE).file(CoverTestImages.png())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/books/{id}/cover", Long.MAX_VALUE)).andExpect(status().isNotFound());
        Long id = book(null);
        mvc.perform(multipart("/api/books/{id}/cover", id)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.file").exists());
        mvc.perform(post("/api/books/{id}/cover", id).contentType("multipart/form-data; boundary=broken").content("invalid"))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @CsvSource({"image/webp,415", "image/gif,415", "image/svg+xml,415", "image/jpeg,415"})
    void shouldReturnSafeUnsupportedProblem(String mime, int expected) throws Exception {
        Long id = book(null);
        mvc.perform(multipart("/api/books/{id}/cover", id).file(new MockMultipartFile("file", "SECRET ORIGINAL", mime, CoverTestImages.image("png"))))
            .andExpect(status().is(expected)).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.errors.file").exists());
        assertThat(books.findById(id).coverUrl()).isNull();
    }

    @Test
    void shouldReturn400ForEmptyCorruptAndOversizedDimensionsAnd413ForBytes() throws Exception {
        Long id = book(null);
        for (byte[] invalid : List.of(new byte[0], "corrupt".getBytes(), CoverTestImages.dimensions(CoverTestImages.image("png"), 6001, 1))) {
            mvc.perform(multipart("/api/books/{id}/cover", id).file(new MockMultipartFile("file", "name", "image/png", invalid)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.file").exists());
        }
        mvc.perform(multipart("/api/books/{id}/cover", id).file(new MockMultipartFile("file", "name", "image/png", new byte[5242881])))
            .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.errors.file").exists());
    }

    @Test
    void shouldRollbackActualDatabaseWriteAndRemoveNewFile() throws Exception {
        Long id = book(null);
        String old = upload(id);
        String previous = books.findById(id).coverUrl();
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new DataIntegrityViolationException("SECRET DATABASE PATH");
        }).when(repository).saveAndFlush(any());
        mvc.perform(multipart("/api/books/{id}/cover", id).file(CoverTestImages.png())).andExpect(status().isInternalServerError());
        assertThat(jdbc.queryForObject("SELECT cover_url FROM book WHERE id=?", String.class, id)).isEqualTo(previous);
        assertThat(directory.resolve(old)).exists();
        try (var files = Files.list(directory)) { assertThat(files.filter(p -> p.getFileName().toString().startsWith(id + "-")).toList()).containsExactly(directory.resolve(old)); }
    }

    @Test
    void shouldKeepOriginalFailureEvenWhenRollbackCleanupFails() throws Exception {
        Long id = book(null);
        doThrow(new DataIntegrityViolationException("SECRET DATABASE")).when(repository).saveAndFlush(any());
        doThrow(CoverException.storage()).when(storage).delete(anyString());
        assertThatThrownBy(() -> covers.upload(id, CoverTestImages.png())).isInstanceOfSatisfying(CoverException.class,
            ex -> assertThat(ex.getMessage()).isEqualTo("Cover association could not be persisted"));
        assertThat(books.findById(id).coverUrl()).isNull();
        try (var files = Files.list(directory)) { assertThat(files.filter(p -> p.getFileName().toString().startsWith(id + "-")).count()).isEqualTo(1); }
    }

    @Test
    void shouldPreserveNewCoverWhenOldCleanupFailsAfterCommit() throws Exception {
        Long id = book(null);
        String old = upload(id);
        doThrow(CoverException.storage()).when(storage).delete(old);
        mvc.perform(multipart("/api/books/{id}/cover", id).file(CoverTestImages.png())).andExpect(status().isOk());
        String current = urls.ownedFilename(id, books.findById(id).coverUrl());
        assertThat(current).isNotEqualTo(old);
        assertThat(directory.resolve(old)).exists();
        assertThat(directory.resolve(current)).exists();
        assertThat(storage.read(current).bytes()).isEqualTo(CoverTestImages.image("png"));
        doThrow(CoverException.storage()).when(storage).delete(current);
        mvc.perform(delete("/api/books/{id}/cover", id)).andExpect(status().isNoContent());
        assertThat(books.findById(id).coverUrl()).isNull();
        assertThat(directory.resolve(current)).exists();
    }

    @Test
    void shouldKeepExistingCoverOnStorageWriteFailure() throws Exception {
        Long id = book(null);
        String old = upload(id);
        String previous = books.findById(id).coverUrl();
        doThrow(CoverException.storage()).when(storage).store(anyLong(), any());
        mvc.perform(multipart("/api/books/{id}/cover", id).file(CoverTestImages.png())).andExpect(status().isInternalServerError());
        assertThat(books.findById(id).coverUrl()).isEqualTo(previous);
        assertThat(directory.resolve(old)).exists();
    }

    @Test
    void shouldKeepReferenceAndFileWhenDeleteDatabaseUpdateFails() throws Exception {
        Long id = book(null);
        String old = upload(id);
        String previous = books.findById(id).coverUrl();
        doThrow(new DataIntegrityViolationException("SECRET DATABASE PATH")).when(repository).saveAndFlush(any());
        mvc.perform(delete("/api/books/{id}/cover", id)).andExpect(status().isInternalServerError());
        assertThat(books.findById(id).coverUrl()).isEqualTo(previous);
        assertThat(directory.resolve(old)).exists();
    }

    @Test
    void shouldCleanupNewFileIfBookDisappearsBeforeAssociation() throws Exception {
        Long id = book(null);
        doAnswer(invocation -> {
            String filename = (String) invocation.callRealMethod();
            repository.deleteById(id);
            return filename;
        }).when(storage).store(anyLong(), any());
        assertThatThrownBy(() -> covers.upload(id, CoverTestImages.png())).isInstanceOf(BookNotFoundException.class);
        try (var files = Files.list(directory)) { assertThat(files.filter(p -> p.getFileName().toString().startsWith(id + "-")).count()).isZero(); }
    }

    @Test
    void shouldReturnSafe500ForStoredContentReadFailure() throws Exception {
        Long id = book(null);
        String filename = upload(id);
        doThrow(CoverException.storage()).when(storage).read(filename);
        var result = mvc.perform(get("/api/covers/{filename}", filename)).andExpect(status().isInternalServerError())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain(directory.toString(), "stackTrace");
    }

    @Test
    void shouldIntegratePutAndBookDeletionAndRejectManualManagedAssignments() throws Exception {
        Long id = book(null);
        String first = upload(id);
        String current = books.findById(id).coverUrl();
        books.update(id, request(current));
        assertThat(directory.resolve(first)).exists();
        Long other = book(null);
        assertThatThrownBy(() -> books.update(other, request(current))).isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> books.create(request(current))).isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> books.update(id, request(urls.publicUrl(id + "-00000000-0000-0000-0000-000000000000.png"))))
            .isInstanceOf(CoverException.class);
        books.update(id, request("https://example.com/external.jpg"));
        assertThat(directory.resolve(first)).doesNotExist();
        String second = upload(id);
        books.update(id, request(null));
        assertThat(directory.resolve(second)).doesNotExist();
        String third = upload(id);
        books.delete(id);
        assertThat(directory.resolve(third)).doesNotExist();
        assertThat(repository.existsById(id)).isFalse();
    }

    @Test
    void shouldNotCleanupPutOrBookDeletionBeforeCommitOrOnRollback() throws Exception {
        Long id = book(null);
        String filename = upload(id);
        String previous = books.findById(id).coverUrl();
        TransactionTemplate tx = new TransactionTemplate(manager);
        tx.executeWithoutResult(status -> {
            books.update(id, request(null));
            repository.flush();
            assertThat(directory.resolve(filename)).exists();
            status.setRollbackOnly();
        });
        assertThat(books.findById(id).coverUrl()).isEqualTo(previous);
        tx.executeWithoutResult(status -> {
            books.delete(id);
            repository.flush();
            assertThat(directory.resolve(filename)).exists();
            status.setRollbackOnly();
        });
        assertThat(repository.existsById(id)).isTrue();
        assertThat(directory.resolve(filename)).exists();
    }

    @Test
    void shouldRejectInvalidMissingAndTemporaryGetNames() throws Exception {
        for (String name : List.of("arbitrary.png", ".upload-uuid.tmp", "..", "%2e%2e%2foutside.png", "1-00000000-0000-0000-0000-000000000000.png")) {
            mvc.perform(get("/api/covers/{filename}", name)).andExpect(status().isNotFound());
        }
    }
}

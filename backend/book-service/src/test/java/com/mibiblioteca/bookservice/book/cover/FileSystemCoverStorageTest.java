package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class FileSystemCoverStorageTest {
    @TempDir Path directory;
    private FileSystemCoverStorage storage;
    private CoverImageValidator validator;

    @BeforeEach
    void setUp() {
        var properties = CoverTestImages.properties(directory.resolve("covers"));
        validator = new CoverImageValidator(properties);
        storage = new FileSystemCoverStorage(properties, new CoverUrls(properties), validator);
    }

    @Test
    void shouldStorePublishReadAndDeleteWithoutOverwriting() throws Exception {
        var image = validator.validate(CoverTestImages.png());
        String first = storage.store(1L, image);
        String second = storage.store(1L, image);
        assertThat(first).matches("1-[0-9a-f-]{36}\\.png").isNotEqualTo(second);
        assertThat(storage.read(first).bytes()).isEqualTo(image.bytes());
        try (var files = Files.list(directory.resolve("covers"))) { assertThat(files.map(Path::getFileName).map(Path::toString)).containsExactlyInAnyOrder(first, second); }
        storage.delete(first);
        storage.delete(first);
        assertThat(storage.read(second).bytes()).isEqualTo(image.bytes());
        assert404(() -> storage.read(first));
    }

    @ParameterizedTest
    @ValueSource(strings = {"..", "../outside.png", "..\\outside.png", "/absolute.png", "C:\\cover.png", "%2e%2e%2foutside.png", "arbitrary.png", ".upload-uuid.tmp", "1-uuid.png", "9223372036854775808-00000000-0000-0000-0000-000000000000.png"})
    void shouldRejectTraversalAndUnmanagedNames(String filename) {
        assert404(() -> storage.read(filename));
        assert404(() -> storage.delete(filename));
        assertThat(directory.resolve("covers")).doesNotExist();
    }

    @Test
    void shouldReturn404WhenRootOrFileIsMissing() throws Exception {
        String missing = "1-" + UUID.randomUUID() + ".png";
        assert404(() -> storage.read(missing));
        storage.delete(missing);
        Files.createDirectory(directory.resolve("covers"));
        assert404(() -> storage.read(missing));
    }

    @Test
    void shouldFailSafelyWhenRootIsNotDirectory() throws Exception {
        Files.writeString(directory.resolve("covers"), "not a directory");
        assertThatThrownBy(() -> storage.store(1L, validator.validate(CoverTestImages.png())))
            .isInstanceOfSatisfying(CoverException.class, ex -> assertThat(ex.status().value()).isEqualTo(500));
    }

    @Test
    void shouldNotFollowSymbolicLinksWhenPlatformPermitsThem() throws Exception {
        Files.createDirectory(directory.resolve("covers"));
        Path target = directory.resolve("outside.png");
        Files.write(target, CoverTestImages.image("png"));
        String filename = "1-" + UUID.randomUUID() + ".png";
        try { Files.createSymbolicLink(directory.resolve("covers").resolve(filename), target); }
        catch (java.io.IOException | UnsupportedOperationException | SecurityException ex) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symbolic links are unavailable on this platform");
        }
        assert404(() -> storage.read(filename));
        assertThatThrownBy(() -> storage.delete(filename)).isInstanceOf(CoverException.class);
        assertThat(Files.readAllBytes(target)).isEqualTo(CoverTestImages.image("png"));
    }

    private void assert404(Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(CoverException.class, ex -> assertThat(ex.status().value()).isEqualTo(404));
    }
}

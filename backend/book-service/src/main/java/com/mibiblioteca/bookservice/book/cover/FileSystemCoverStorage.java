package com.mibiblioteca.bookservice.book.cover;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class FileSystemCoverStorage implements CoverStorage {
    private static final Logger log = LoggerFactory.getLogger(FileSystemCoverStorage.class);
    private final Path root;
    private final CoverUrls urls;
    private final CoverImageValidator validator;
    private final int maximum;

    public FileSystemCoverStorage(CoverStorageProperties properties, CoverUrls urls, CoverImageValidator validator) {
        root = properties.directory().toAbsolutePath().normalize();
        maximum = Math.toIntExact(properties.maxFileSize().toBytes());
        this.urls = urls;
        this.validator = validator;
    }

    @Override
    public String store(Long bookId, ValidatedCover image) {
        if (bookId == null || bookId <= 0 || image == null || image.format() == null || image.bytes().length > maximum) {
            throw CoverException.storage();
        }
        String filename = bookId + "-" + UUID.randomUUID() + "." + image.format().extension();
        Path temporary = root.resolve(".upload-" + UUID.randomUUID() + ".tmp");
        boolean temporaryCreated = false;
        try {
            checkRoot(true);
            try (var output = Files.newOutputStream(temporary, StandardOpenOption.CREATE_NEW,
                StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
                temporaryCreated = true;
                output.write(image.bytes());
            }
            checkRoot(false);
            // Same-directory move without REPLACE_EXISTING: complete bytes only, no overwrites.
            Files.move(temporary, root.resolve(filename));
            return filename;
        } catch (IOException | SecurityException ex) {
            throw CoverException.storage();
        } finally {
            if (temporaryCreated) {
                try {
                    checkRoot(false);
                    Files.deleteIfExists(temporary);
                } catch (IOException | RuntimeException ex) {
                    log.warn("Cover temporary cleanup failed ({})", ex.getClass().getSimpleName());
                }
            }
        }
    }

    @Override
    public ValidatedCover read(String filename) {
        if (!urls.validFilename(filename)) { throw CoverException.notFound(); }
        try {
            checkRoot(false);
            Path file = root.resolve(filename);
            if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) { throw CoverException.notFound(); }
            byte[] bytes;
            try (InputStream input = Files.newInputStream(file, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
                bytes = input.readNBytes(maximum + 1);
            }
            CoverFormat format = validator.detect(bytes);
            if (bytes.length > maximum || format == null || !filename.endsWith("." + format.extension())) { throw CoverException.storage(); }
            return new ValidatedCover(bytes, format);
        } catch (NoSuchFileException ex) { throw CoverException.notFound(); }
        catch (IOException | SecurityException ex) { throw CoverException.storage(); }
    }

    @Override
    public void delete(String filename) {
        if (!urls.validFilename(filename)) { throw CoverException.notFound(); }
        try {
            checkRoot(false);
            Path file = root.resolve(filename);
            if (Files.isSymbolicLink(file)) { throw CoverException.storage(); }
            if (Files.exists(file, LinkOption.NOFOLLOW_LINKS) && !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
                throw CoverException.storage();
            }
            Files.deleteIfExists(file);
        } catch (NoSuchFileException ex) {
            // Missing root/file is already deleted.
        } catch (IOException | SecurityException ex) { throw CoverException.storage(); }
    }

    private void checkRoot(boolean create) throws IOException {
        Path current = root.getRoot();
        for (Path part : root) {
            current = current.resolve(part);
            if (Files.isSymbolicLink(current)) { throw CoverException.storage(); }
        }
        if (create) { Files.createDirectories(root); }
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) { throw new NoSuchFileException("Cover directory unavailable"); }
        if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)) { throw CoverException.storage(); }
    }
}

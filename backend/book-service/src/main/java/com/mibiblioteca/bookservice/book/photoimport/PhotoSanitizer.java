package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.common.image.ImageContentValidator;
import com.mibiblioteca.bookservice.common.image.ImageValidationException;
import com.mibiblioteca.bookservice.book.photoimport.BookPhotoRecognitionProvider.PhotoImage;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class PhotoSanitizer {
    private final PhotoImportProperties properties;
    private final ImageContentValidator images = new ImageContentValidator();

    public PhotoSanitizer(PhotoImportProperties properties) { this.properties = properties; }

    public PhotoImage sanitize(MultipartFile file, int rotation) {
        BufferedImage decoded = null, rotated = null;
        try {
            byte[] bytes = images.read(file, (int) properties.maxFileSize().toBytes());
            decoded = images.decode(bytes, file.getContentType(), properties.maxWidth(), properties.maxHeight(), properties.maxPixels());
            rotated = transform(decoded, new PhotoOrientation().read(bytes), rotation);
            // New pixel-only image and default PNG metadata: no APP1, eXIf, text, thumbnails or GPS.
            var output = new BoundedOutput();
            var writer = ImageIO.getImageWritersByFormatName("PNG").next();
            try (var stream = new MemoryCacheImageOutputStream(output)) {
                writer.setOutput(stream);
                writer.write(null, new javax.imageio.IIOImage(rotated, null, null), writer.getDefaultWriteParam());
            } finally { writer.dispose(); }
            return new PhotoImage(output.toByteArray(), "image/png", rotated.getWidth(), rotated.getHeight());
        } catch (ImageValidationException ex) {
            throw new PhotoImportException(ex.status(), "PHOTO_INVALID", ex.getMessage(), "file");
        } catch (IOException ex) {
            throw new PhotoImportException(HttpStatus.INTERNAL_SERVER_ERROR, "PHOTO_PROCESSING_FAILED", "Could not prepare photo", null);
        } finally {
            if (decoded != null) decoded.flush();
            if (rotated != null) rotated.flush();
        }
    }

    private BufferedImage transform(BufferedImage source, int orientation, int rotation) {
        int w = source.getWidth(), h = source.getHeight();
        boolean transpose = orientation >= 5;
        int orientedWidth = transpose ? h : w, orientedHeight = transpose ? w : h;
        boolean quarterTurn = rotation == 90 || rotation == 270;
        var target = new BufferedImage(quarterTurn ? orientedHeight : orientedWidth,
            quarterTurn ? orientedWidth : orientedHeight, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) {
            if (Thread.currentThread().isInterrupted()) throw PhotoImportException.timeout();
            for (int x = 0; x < w; x++) {
                int tx = x, ty = y;
                switch (orientation) {
                    case 2 -> tx = w - 1 - x;
                    case 3 -> { tx = w - 1 - x; ty = h - 1 - y; }
                    case 4 -> ty = h - 1 - y;
                    case 5 -> { tx = y; ty = x; }
                    case 6 -> { tx = h - 1 - y; ty = x; }
                    case 7 -> { tx = h - 1 - y; ty = w - 1 - x; }
                    case 8 -> { tx = y; ty = w - 1 - x; }
                    default -> { }
                }
                int finalX = tx, finalY = ty;
                switch (rotation) {
                    case 90 -> { finalX = orientedHeight - 1 - ty; finalY = tx; }
                    case 180 -> { finalX = orientedWidth - 1 - tx; finalY = orientedHeight - 1 - ty; }
                    case 270 -> { finalX = ty; finalY = orientedWidth - 1 - tx; }
                    default -> { }
                }
                target.setRGB(finalX, finalY, source.getRGB(x, y));
            }
        }
        return target;
    }

    private static final class BoundedOutput extends ByteArrayOutputStream {
        private static final int MAX_ENCODED_BYTES = 64 * 1024 * 1024;

        @Override
        public synchronized void write(byte[] bytes, int offset, int length) {
            check(length);
            super.write(bytes, offset, length);
        }

        @Override
        public synchronized void write(int value) {
            check(1);
            super.write(value);
        }

        private void check(int additional) {
            if (additional > MAX_ENCODED_BYTES - count) throw PhotoImportException.invalid("Rebuilt image exceeds the processing memory limit", "file");
        }
    }
}

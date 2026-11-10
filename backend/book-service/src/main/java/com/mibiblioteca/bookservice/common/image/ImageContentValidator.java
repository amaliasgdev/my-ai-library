package com.mibiblioteca.bookservice.common.image;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

/** Shared strict decoding only. No storage, transformations or external calls. */
public class ImageContentValidator {
    private static final byte[] PNG_SIGNATURE = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};

    public byte[] read(MultipartFile file, int maximum) {
        if (file == null) throw invalid("file is required");
        if (file.isEmpty()) throw invalid("file must not be empty");
        if (file.getSize() > maximum) throw tooLarge();
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(maximum + 1);
            if (bytes.length == 0) throw invalid("file must not be empty");
            if (bytes.length > maximum) throw tooLarge();
            return bytes;
        } catch (IOException ex) {
            throw new ImageValidationException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not read image");
        }
    }

    /** Caller owns and must flush the decoded pixels. Original bytes are never rewritten. */
    public BufferedImage decode(byte[] bytes, String contentType, int maxWidth, int maxHeight, long maxPixels) {
        String declared;
        try {
            MediaType type = MediaType.parseMediaType(contentType == null ? "" : contentType);
            declared = (type.getType() + "/" + type.getSubtype()).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException ex) { throw unsupported(); }
        if (!declared.equals("image/jpeg") && !declared.equals("image/png")) throw unsupported();
        String format = detect(bytes);
        if (format == null) {
            String signature = new String(bytes, 0, Math.min(bytes.length, 12), StandardCharsets.US_ASCII);
            String text = new String(bytes, 0, Math.min(bytes.length, 256), StandardCharsets.UTF_8).stripLeading();
            if (signature.startsWith("GIF8") || (signature.startsWith("RIFF") && signature.endsWith("WEBP"))
                || text.startsWith("<svg") || (text.startsWith("<?xml") && text.contains("<svg"))) throw unsupported();
            throw invalid("file must contain a valid JPEG or PNG image");
        }
        if (!declared.equals(format.equals("PNG") ? "image/png" : "image/jpeg")) throw unsupported();
        if (format.equals("PNG")) validatePngChunks(bytes);
        if (format.equals("JPEG") && (bytes.length < 4 || bytes[bytes.length - 2] != (byte) 0xff || bytes[bytes.length - 1] != (byte) 0xd9)) {
            throw invalid("file contains a corrupt image");
        }
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalid("file is not decodable");
            var reader = readers.next();
            try {
                if (!reader.getFormatName().equalsIgnoreCase(format)) throw unsupported();
                AtomicBoolean warned = new AtomicBoolean();
                reader.addIIOReadWarningListener((source, warning) -> warned.set(true));
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width > maxWidth || height > maxHeight || (long) width * height > maxPixels) {
                    throw invalid("file exceeds the allowed image dimensions");
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null) throw invalid("file is not decodable");
                if (warned.get()) {
                    decoded.flush();
                    throw invalid("file contains a corrupt image");
                }
                return decoded;
            } finally { reader.dispose(); }
        } catch (ImageValidationException ex) { throw ex; }
        catch (IOException | RuntimeException ex) { throw invalid("file contains a corrupt image"); }
    }

    public String detect(byte[] bytes) {
        if (bytes.length >= 8 && Arrays.equals(PNG_SIGNATURE, Arrays.copyOf(bytes, 8))) return "PNG";
        if (bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff) return "JPEG";
        return null;
    }

    private void validatePngChunks(byte[] bytes) {
        int offset = 8;
        boolean first = true, ended = false;
        while (offset < bytes.length) {
            if (bytes.length - offset < 12) throw invalid("file contains a corrupt PNG");
            int length = ByteBuffer.wrap(bytes, offset, 4).getInt();
            if (length < 0 || length > bytes.length - offset - 12) throw invalid("file contains a corrupt PNG");
            String type = new String(bytes, offset + 4, 4, StandardCharsets.US_ASCII);
            if (first && (!type.equals("IHDR") || length != 13)) throw invalid("file contains a corrupt PNG");
            first = false;
            if (type.equals("acTL") || type.equals("fcTL") || type.equals("fdAT")) throw unsupported();
            CRC32 crc = new CRC32();
            crc.update(bytes, offset + 4, length + 4);
            if (crc.getValue() != Integer.toUnsignedLong(ByteBuffer.wrap(bytes, offset + 8 + length, 4).getInt())) throw invalid("file contains a corrupt PNG");
            offset += length + 12;
            if (type.equals("IEND")) {
                if (length != 0 || offset != bytes.length) throw invalid("file contains a corrupt PNG");
                ended = true;
                break;
            }
        }
        if (!ended) throw invalid("file contains a corrupt PNG");
    }

    private ImageValidationException invalid(String message) { return new ImageValidationException(HttpStatus.BAD_REQUEST, message); }
    private ImageValidationException unsupported() { return new ImageValidationException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only matching JPEG/image/jpeg and static PNG/image/png are supported"); }
    private ImageValidationException tooLarge() { return new ImageValidationException(HttpStatus.PAYLOAD_TOO_LARGE, "file exceeds the maximum upload size"); }
}

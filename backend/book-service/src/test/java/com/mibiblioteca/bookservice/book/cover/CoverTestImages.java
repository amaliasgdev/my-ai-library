package com.mibiblioteca.bookservice.book.cover;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

public class CoverTestImages {
    public static CoverStorageProperties properties(Path directory) {
        return new CoverStorageProperties(directory, java.net.URI.create("http://localhost:8081/api/covers"),
            DataSize.ofMegabytes(5), 6000, 6000, 20000000);
    }

    public static byte[] image(String format) throws IOException {
        BufferedImage image = new BufferedImage(3, 4, BufferedImage.TYPE_INT_RGB);
        image.setRGB(1, 1, 0xff0088);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, format, output)) { throw new IOException("Missing test image writer"); }
        image.flush();
        return output.toByteArray();
    }

    public static MockMultipartFile png() throws IOException {
        return new MockMultipartFile("file", "misleading.jpg", "image/png", image("png"));
    }

    public static byte[] addChunk(byte[] png, String type, byte[] data) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(png, 0, png.length - 12);
        output.write(ByteBuffer.allocate(4).putInt(data.length).array());
        byte[] name = type.getBytes(StandardCharsets.US_ASCII);
        output.write(name);
        output.write(data);
        CRC32 crc = new CRC32();
        crc.update(name);
        crc.update(data);
        output.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
        output.write(png, png.length - 12, 12);
        return output.toByteArray();
    }

    public static byte[] dimensions(byte[] png, int width, int height) {
        byte[] changed = Arrays.copyOf(png, png.length);
        ByteBuffer.wrap(changed, 16, 8).putInt(width).putInt(height);
        CRC32 crc = new CRC32();
        crc.update(changed, 12, 17);
        ByteBuffer.wrap(changed, 29, 4).putInt((int) crc.getValue());
        return changed;
    }
}

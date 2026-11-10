package com.mibiblioteca.bookservice.book.photoimport;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.book.cover.CoverTestImages;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;

class PhotoSanitizerTest {
    private final PhotoSanitizer sanitizer = new PhotoSanitizer(PhotoTestSupport.properties(false));

    static byte[] tiff(int orientation, ByteOrder order) {
        return ByteBuffer.allocate(26).order(order).put((byte) (order == ByteOrder.LITTLE_ENDIAN ? 'I' : 'M'))
            .put((byte) (order == ByteOrder.LITTLE_ENDIAN ? 'I' : 'M')).putShort((short) 42).putInt(8)
            .putShort((short) 1).putShort((short) 0x112).putShort((short) 3).putInt(1)
            .putShort((short) orientation).putShort((short) 0).putInt(0).array();
    }

    static byte[] exifJpeg(int orientation) throws Exception {
        byte[] jpeg = CoverTestImages.image("jpeg");
        var output = new ByteArrayOutputStream();
        output.write(jpeg, 0, 2);
        output.write(new byte[] {(byte) 255, (byte) 0xe1, 0, 34});
        output.write(new byte[] {'E', 'x', 'i', 'f', 0, 0});
        output.write(tiff(orientation, ByteOrder.LITTLE_ENDIAN));
        output.write(jpeg, 2, jpeg.length - 2);
        return output.toByteArray();
    }

    @ParameterizedTest
    @CsvSource({"1,3,4,0,0", "2,3,4,2,0", "3,3,4,2,3", "4,3,4,0,3", "5,4,3,0,0", "6,4,3,3,0", "7,4,3,3,2", "8,4,3,0,2"})
    void appliesAllEightExifOrientationsIncludingMirrors(int orientation, int width, int height, int redX, int redY) throws Exception {
        var source = new BufferedImage(3, 4, BufferedImage.TYPE_INT_RGB);
        source.setRGB(0, 0, 0xffff0000);
        source.setRGB(2, 3, 0xff0000ff);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(source, "PNG", bytes);
        source.flush();
        byte[] png = CoverTestImages.addChunk(bytes.toByteArray(), "eXIf", tiff(orientation, ByteOrder.BIG_ENDIAN));
        var result = sanitizer.sanitize(file("image/png", png), 0);
        assertThat(result.width()).isEqualTo(width);
        assertThat(result.height()).isEqualTo(height);
        var decoded = ImageIO.read(new ByteArrayInputStream(result.bytes()));
        assertThat(decoded.getRGB(redX, redY)).isEqualTo(0xffff0000);
        decoded.flush();
    }

    @ParameterizedTest
    @CsvSource({"0,4,3,3,0", "90,3,4,2,3", "180,4,3,0,2", "270,3,4,0,0"})
    void appliesJpegExifBeforeManualClockwiseRotationExactlyOnce(int rotation, int width, int height, int redX, int redY) throws Exception {
        var result = sanitizer.sanitize(file("image/jpeg", exifJpeg(6)), rotation);
        assertThat(result.mediaType()).isEqualTo("image/png");
        assertThat(result.width()).isEqualTo(width);
        assertThat(result.height()).isEqualTo(height);
        var source = new BufferedImage(3, 4, BufferedImage.TYPE_INT_RGB);
        source.setRGB(0, 0, 0xffff0000);
        var pixels = new ByteArrayOutputStream();
        ImageIO.write(source, "PNG", pixels);
        source.flush();
        var png = CoverTestImages.addChunk(pixels.toByteArray(), "eXIf", tiff(6, ByteOrder.LITTLE_ENDIAN));
        var rebuilt = sanitizer.sanitize(file("image/png", png), rotation);
        var decoded = ImageIO.read(new ByteArrayInputStream(rebuilt.bytes()));
        assertThat(decoded.getRGB(redX, redY)).isEqualTo(0xffff0000);
        decoded.flush();
    }

    @Test
    void reconstructsPixelOnlyPngWithoutExifGpsOrOtherMetadataAndDoesNotResize() throws Exception {
        byte[] png = CoverTestImages.addChunk(CoverTestImages.image("png"), "tEXt", "GPS\0SECRET LOCATION".getBytes(StandardCharsets.US_ASCII));
        png = CoverTestImages.addChunk(png, "eXIf", tiff(1, ByteOrder.LITTLE_ENDIAN));
        var result = sanitizer.sanitize(file("image/png", png), 0);
        assertThat(result.width()).isEqualTo(3);
        assertThat(result.height()).isEqualTo(4);
        for (int offset = 8; offset < result.bytes().length;) {
            int length = ByteBuffer.wrap(result.bytes(), offset, 4).getInt();
            assertThat(new String(result.bytes(), offset + 4, 4, StandardCharsets.US_ASCII)).isIn("IHDR", "IDAT", "IEND");
            offset += length + 12;
        }
        assertThat(new String(result.bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("SECRET", "GPS", "Exif");
    }

    @Test
    void rejectsMalformedExifAndUnsafeOffsets() throws Exception {
        for (byte[] exif : new byte[][] {tiff(9, ByteOrder.LITTLE_ENDIAN), new byte[2],
            ByteBuffer.wrap(tiff(1, ByteOrder.LITTLE_ENDIAN)).order(ByteOrder.LITTLE_ENDIAN).putInt(4, Integer.MAX_VALUE).array()}) {
            byte[] png = CoverTestImages.addChunk(CoverTestImages.image("png"), "eXIf", exif);
            failure(sanitizer, file("image/png", png), 400);
        }
        byte[] png = CoverTestImages.addChunk(CoverTestImages.image("png"), "eXIf", tiff(1, ByteOrder.LITTLE_ENDIAN));
        png = CoverTestImages.addChunk(png, "eXIf", tiff(6, ByteOrder.LITTLE_ENDIAN));
        failure(sanitizer, file("image/png", png), 400);
    }

    @Test
    void rejectsMissingEmptyCorruptMismatchedAndUnsupportedFiles() throws Exception {
        failure(sanitizer, null, 400);
        failure(sanitizer, file("image/png", new byte[0]), 400);
        failure(sanitizer, file("image/png", "not image".getBytes()), 400);
        failure(sanitizer, file("image/jpeg", CoverTestImages.image("png")), 415);
        for (String mime : new String[] {"image/webp", "image/gif", "image/svg+xml", "image/heic", "application/pdf"}) {
            failure(sanitizer, file(mime, CoverTestImages.image("png")), 415);
        }
        byte[] png = CoverTestImages.image("png");
        png[40] ^= 1;
        failure(sanitizer, file("image/png", png), 400);
        byte[] jpeg = CoverTestImages.image("jpeg");
        failure(sanitizer, file("image/jpeg", Arrays.copyOf(jpeg, jpeg.length - 2)), 400);
        failure(sanitizer, file("image/png", CoverTestImages.addChunk(CoverTestImages.image("png"), "acTL", new byte[8])), 415);
    }

    @Test
    void enforcesReportedAndActualSizeIncludingExactBoundary() throws Exception {
        int limit = 5242880;
        byte[] png = CoverTestImages.image("png");
        byte[] padded = CoverTestImages.addChunk(png, "npAd", new byte[limit - png.length - 12]);
        assertThat(sanitizer.sanitize(file("image/png", padded), 0).width()).isEqualTo(3);
        failure(sanitizer, file("image/png", new byte[limit + 1]), 413);
        failure(sanitizer, new MockMultipartFile("file", "name", "image/png", new byte[limit + 1]) {
            @Override public long getSize() { return 1; }
        }, 413);
    }

    @ParameterizedTest
    @CsvSource({"6001,1", "1,6001", "5000,5000", "0,1", "1,0", "2147483647,2147483647"})
    void rejectsDimensionsBeforeDecodingHugePayloads(int width, int height) throws Exception {
        failure(sanitizer, file("image/png", CoverTestImages.dimensions(CoverTestImages.image("png"), width, height)), 400);
    }

    @Test
    void respectsLowerConfiguredDimensionsAndPixels() throws Exception {
        var limited = new PhotoSanitizer(PhotoTestSupport.properties(false, 2, 4, 8, Duration.ofSeconds(1)));
        failure(limited, CoverTestImages.png(), 400);
    }

    private static MockMultipartFile file(String mime, byte[] bytes) {
        return new MockMultipartFile("file", "../../private-name", mime, bytes);
    }

    private static void failure(PhotoSanitizer sanitizer, MockMultipartFile file, int code) {
        assertThatThrownBy(() -> sanitizer.sanitize(file, 0)).isInstanceOfSatisfying(PhotoImportException.class,
            ex -> { assertThat(ex.status().value()).isEqualTo(code); assertThat(ex.getMessage()).doesNotContain("private-name"); });
    }
}

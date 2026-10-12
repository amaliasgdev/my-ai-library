package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;

class CoverImageValidatorTest {
    private final CoverImageValidator validator = new CoverImageValidator(CoverTestImages.properties(Path.of("unused")));

    @ParameterizedTest
    @CsvSource({"jpeg,image/jpeg,JPEG", "png,image/png,PNG"})
    void shouldDecodeValidImageAndIgnoreOriginalName(String type, String mime, CoverFormat expected) throws Exception {
        byte[] image = CoverTestImages.image(type);
        var result = validator.validate(new MockMultipartFile("file", "../../dangerous.svg", mime, image));
        assertThat(result.format()).isEqualTo(expected);
        assertThat(result.bytes()).isEqualTo(image);
    }

    @ParameterizedTest
    @CsvSource({"image/webp,415", "image/gif,415", "image/svg+xml,415", "application/octet-stream,415", "image/jpeg,415"})
    void shouldRejectUnsupportedOrMismatchedMime(String mime, int code) throws Exception {
        failure(new MockMultipartFile("file", "name", mime, CoverTestImages.image("png")), code);
    }

    @Test
    void shouldRejectAbsentEmptyAndNonImageFiles() {
        failure(null, 400);
        failure(new MockMultipartFile("file", new byte[0]), 400);
        failure(new MockMultipartFile("file", "cover.png", "image/png", "not an image".getBytes()), 400);
    }

    @Test
    void shouldRejectUnsupportedRealContentEvenWhenDeclaredPng() {
        failure(new MockMultipartFile("file", "cover.png", "image/png", "RIFF1234WEBP".getBytes()), 415);
        failure(new MockMultipartFile("file", "cover.png", "image/png", "GIF89a123456".getBytes()), 415);
        failure(new MockMultipartFile("file", "cover.png", "image/png", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes()), 415);
    }

    @Test
    void shouldRejectCorruptSignatureBearingPngAndTruncatedJpeg() throws Exception {
        byte[] png = CoverTestImages.image("png");
        png[40] ^= 1;
        failure(new MockMultipartFile("file", "name", "image/png", png), 400);
        byte[] jpeg = CoverTestImages.image("jpeg");
        failure(new MockMultipartFile("file", "name", "image/jpeg", Arrays.copyOf(jpeg, jpeg.length - 2)), 400);
    }

    @Test
    void shouldRejectApngChunks() throws Exception {
        byte[] apng = CoverTestImages.addChunk(CoverTestImages.image("png"), "acTL", new byte[8]);
        failure(new MockMultipartFile("file", "name", "image/png", apng), 415);
    }

    @Test
    void shouldAcceptExactlyFiveMebibytesAndRejectExcess() throws Exception {
        int limit = 5242880;
        byte[] original = CoverTestImages.image("png");
        byte[] padded = CoverTestImages.addChunk(original, "npAd", new byte[limit - original.length - 12]);
        assertThat(padded.length).isEqualTo(limit);
        assertThat(validator.validate(new MockMultipartFile("file", "name", "image/png", padded)).bytes()).hasSize(limit);
        failure(new MockMultipartFile("file", "name", "image/png", Arrays.copyOf(padded, limit + 1)), 413);
    }

    @ParameterizedTest
    @CsvSource({"6001,1", "1,6001", "5000,5000", "0,1", "1,0"})
    void shouldRejectDimensionsBeforeAllocatingDecodedImage(int width, int height) throws Exception {
        byte[] image = CoverTestImages.dimensions(CoverTestImages.image("png"), width, height);
        failure(new MockMultipartFile("file", "name", "image/png", image), 400);
    }

    @Test
    void shouldBoundActualStreamEvenIfReportedSizeIsWrong() throws Exception {
        byte[] bytes = new byte[5242881];
        MockMultipartFile file = new MockMultipartFile("file", "name", "image/png", bytes) {
            @Override public long getSize() { return 1; }
        };
        failure(file, 413);
    }

    @Test
    void shouldSanitizeInputReadFailure() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "name", "image/png", new byte[] {1}) {
            @Override public java.io.InputStream getInputStream() throws IOException { throw new IOException("SECRET PATH"); }
        };
        failure(file, 500);
    }

    private void failure(MockMultipartFile file, int status) {
        assertThatThrownBy(() -> validator.validate(file)).isInstanceOfSatisfying(CoverException.class, ex -> {
            assertThat(ex.status().value()).isEqualTo(status);
            assertThat(ex.getMessage()).doesNotContain("SECRET", "dangerous");
        });
    }
}

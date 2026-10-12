package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.net.URI;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CoverUrlsTest {
    private final CoverUrls urls = new CoverUrls(CoverTestImages.properties(Path.of("unused")));
    private final String filename = "1-" + UUID.randomUUID() + ".png";

    @Test
    void shouldRecognizeOnlySameOriginManagedPathAndCorrectBook() {
        String url = urls.publicUrl(filename);
        assertThat(urls.ownedFilename(1L, url)).isEqualTo(filename);
        assertThat(urls.ownedFilename(2L, url)).isNull();
        assertThat(urls.ownedFilename(1L, url + "?x=1")).isNull();
        assertThat(urls.ownedFilename(1L, url.replace("localhost", "localhost.evil"))).isNull();
        assertThat(urls.ownedFilename(1L, url.replace("http:", "https:"))).isNull();
        urls.validateAssignment(1L, url, url);
        urls.validateAssignment(1L, url, "https://covers.openlibrary.org/b/id/123-L.jpg");
        urls.validateAssignment(1L, url, null);
        assertThatThrownBy(() -> urls.validateAssignment(2L, null, url)).isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> urls.validateAssignment(null, null, url)).isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> urls.validateAssignment(1L, null, url)).isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> urls.validateAssignment(1L, null, url.replace("/api/covers/", "/api/x/../covers/")))
            .isInstanceOf(CoverException.class);
        assertThatThrownBy(() -> urls.validateAssignment(1L, null, url.replace("/api/covers/", "/api/%63overs/")))
            .isInstanceOf(CoverException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"file:///covers", "https://user@example.com/covers", "https://example.com/covers?q=1", "https://example.com/covers#fragment"})
    void shouldRejectUnsafePublicBaseConfiguration(String url) {
        var original = CoverTestImages.properties(Path.of("unused"));
        assertThatThrownBy(() -> new CoverStorageProperties(original.directory(), URI.create(url), original.maxFileSize(),
            original.maxWidth(), original.maxHeight(), original.maxPixels())).isInstanceOf(IllegalArgumentException.class);
    }
}

package com.mibiblioteca.bookservice.book.photoimport;

import java.time.Duration;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.util.unit.DataSize;

final class PhotoTestSupport {
    static PhotoImportProperties properties(boolean enabled) {
        return properties(enabled, 6000, 6000, 20000000, Duration.ofSeconds(5));
    }

    static PhotoImportProperties properties(boolean enabled, int width, int height, long pixels, Duration timeout) {
        return new PhotoImportProperties(enabled, "mock", DataSize.ofMegabytes(5), width, height, pixels, 25, 1, timeout);
    }

    static MockEnvironment environment(String... profiles) {
        var environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        return environment;
    }
}

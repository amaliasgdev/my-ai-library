package com.mibiblioteca.bookservice.book.lookup;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("external.books.open-library")
public record OpenLibraryProperties(
    URI baseUrl, URI coversBaseUrl, Duration connectTimeout, Duration requestTimeout,
    Duration lookupTimeout, String userAgent, String contact
) {
    public OpenLibraryProperties {
        if (!validBase(baseUrl) || !validBase(coversBaseUrl) || !"https".equalsIgnoreCase(coversBaseUrl.getScheme())) {
            throw new IllegalArgumentException("Open Library base URLs must be valid; covers must use HTTPS");
        }
        if (!positive(connectTimeout) || !positive(requestTimeout) || !positive(lookupTimeout)) {
            throw new IllegalArgumentException("Open Library timeouts must be positive");
        }
        if (userAgent == null || userAgent.isBlank() || userAgent.contains("\r") || userAgent.contains("\n")
            || (contact != null && (contact.contains("\r") || contact.contains("\n")))) {
            throw new IllegalArgumentException("Open Library identification must be valid");
        }
    }

    private static boolean validBase(URI uri) {
        return uri != null && uri.getHost() != null && uri.getUserInfo() == null
            && uri.getQuery() == null && uri.getFragment() == null
            && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()));
    }

    private static boolean positive(Duration duration) {
        return duration != null && !duration.isNegative() && !duration.isZero();
    }
}

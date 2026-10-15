package com.mibiblioteca.bookservice.location.reconciliation;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("locations.reconciliation")
public record ReviewTokenProperties(String secret, Duration ttl) {
    public ReviewTokenProperties {
        ttl = ttl == null ? Duration.ofMinutes(15) : ttl;
        if (ttl.isNegative() || ttl.isZero() || ttl.compareTo(Duration.ofHours(1)) > 0)
            throw new IllegalArgumentException("Reconciliation TTL must be positive and at most one hour");
        if (secret != null && !secret.isEmpty() && secret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32)
            throw new IllegalArgumentException("Reconciliation secret must contain at least 32 UTF-8 bytes");
    }
}

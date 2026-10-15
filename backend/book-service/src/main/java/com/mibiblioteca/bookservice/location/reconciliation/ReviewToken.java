package com.mibiblioteca.bookservice.location.reconciliation;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(ReviewTokenProperties.class)
public class ReviewToken {
    public record Snapshot(int formatVersion, String canonicalGroupKey, long expectedCount,
                           String fingerprint, Instant issuedAt, Instant expiresAt) {}
    private final ObjectMapper mapper;
    private final ReviewTokenProperties properties;
    private final byte[] secret;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public ReviewToken(ObjectMapper mapper, ReviewTokenProperties properties) {
        this(mapper, properties, Clock.systemUTC());
    }
    ReviewToken(ObjectMapper mapper, ReviewTokenProperties properties, Clock clock) {
        this.mapper = mapper; this.properties = properties; this.clock = clock;
        if (properties.secret() == null || properties.secret().isEmpty()) {
            secret = new byte[32]; new SecureRandom().nextBytes(secret);
            org.slf4j.LoggerFactory.getLogger(ReviewToken.class).warn("Reconciliation uses an ephemeral signing key; configure a shared secret for multiple instances and restart continuity");
        } else secret = properties.secret().getBytes(StandardCharsets.UTF_8);
    }
    public Snapshot snapshot(String key, List<ReconciliationDtos.LegacyBook> books) {
        Instant now = clock.instant();
        return new Snapshot(1, key, books.size(), fingerprint(books), now, now.plus(properties.ttl()));
    }
    public String sign(Snapshot snapshot) {
        try {
            String payload = encode(mapper.writeValueAsBytes(snapshot));
            return payload + "." + encode(mac(payload));
        } catch (Exception ex) { throw new IllegalStateException("Cannot issue review token", ex); }
    }
    public Snapshot verify(String token) {
        try {
            if (token == null || token.length() > 4096) throw ReconciliationException.invalid();
            String[] parts = token.split("\\.", -1);
            if (parts.length != 2 || !MessageDigest.isEqual(mac(parts[0]), Base64.getUrlDecoder().decode(parts[1]))) throw ReconciliationException.invalid();
            Snapshot value = mapper.readValue(Base64.getUrlDecoder().decode(parts[0]), Snapshot.class);
            if (value.formatVersion() != 1 || value.canonicalGroupKey() == null || value.expectedCount() < 1
                || value.fingerprint() == null || !value.fingerprint().matches("[A-Za-z0-9_-]{43}")
                || value.issuedAt() == null || value.expiresAt() == null || value.issuedAt().isAfter(clock.instant())
                || !value.expiresAt().isAfter(value.issuedAt())
                || value.expiresAt().isAfter(value.issuedAt().plus(properties.ttl()))) throw ReconciliationException.invalid();
            if (!clock.instant().isBefore(value.expiresAt())) throw new ReconciliationException(HttpStatus.CONFLICT, "RECONCILIATION_EXPIRED", "Review expired. Reload and review the group again");
            return value;
        } catch (ReconciliationException ex) { throw ex; }
        catch (Exception ex) { throw ReconciliationException.invalid(); }
    }
    public String fingerprint(List<ReconciliationDtos.LegacyBook> books) {
        try {
            var bytes = new ByteArrayOutputStream();
            try (var output = new DataOutputStream(bytes)) {
                for (var book : books) {
                    output.writeLong(book.id());
                    for (String text : new String[]{book.room(), book.bookcase(), book.shelf()}) {
                        if (text == null) output.writeInt(-1);
                        else { byte[] value = text.getBytes(StandardCharsets.UTF_8); output.writeInt(value.length); output.write(value); }
                    }
                }
            }
            return encode(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        } catch (Exception ex) { throw new IllegalStateException("Cannot fingerprint legacy group", ex); }
    }
    private byte[] mac(String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII));
    }
    private String encode(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
}

package com.mibiblioteca.bookservice.location.reconciliation;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;

class ReviewTokenTest {
    private final Instant now=Instant.parse("2026-10-15T08:00:00Z");
    private ReviewToken tokens(Instant instant) { return new ReviewToken(JsonMapper.builder().addModule(new JavaTimeModule()).build(),new ReviewTokenProperties("a sufficiently long test-only secret 12345",Duration.ofMinutes(15)),Clock.fixed(instant,ZoneOffset.UTC)); }
    private final List<LegacyBook> books=List.of(new LegacyBook(1,"Title","Author",null,"Salón","Billy","1"));
    @Test void signsAndVerifiesWholeSnapshotWithoutBibliographicDataInFingerprint() {
        var tokens=tokens(now); var snapshot=tokens.snapshot("group",books);
        assertThat(tokens.verify(tokens.sign(snapshot))).isEqualTo(snapshot);
        assertThat(tokens.fingerprint(books)).isEqualTo(tokens.fingerprint(List.of(new LegacyBook(1,"Changed","Other","9780306406157","Salón","Billy","1"))));
        assertThat(snapshot.expiresAt()).isEqualTo(now.plus(Duration.ofMinutes(15)));
    }
    @Test void identityAndOriginalLabelsAreFingerprintInputsWithUnambiguousNullEncoding() {
        var tokens=tokens(now); String original=tokens.fingerprint(books);
        assertThat(tokens.fingerprint(List.of(new LegacyBook(2,"Title","Author",null,"Salón","Billy","1")))).isNotEqualTo(original);
        for (String room:new String[]{null,"","salón"," Salón ","Salon"}) assertThat(tokens.fingerprint(List.of(new LegacyBook(1,"Title","Author",null,room,"Billy","1")))).isNotEqualTo(original);
        assertThat(tokens.fingerprint(List.of(new LegacyBook(1,"","",null,"a/b","c",null)))).isNotEqualTo(tokens.fingerprint(List.of(new LegacyBook(1,"","",null,"a","b/c",null))));
    }
    @ParameterizedTest @ValueSource(strings={"","garbage","a.b","a.b.c","..","%%%%.%%%%"})
    void malformedOrTamperedTokensAreSafe400(String token) { assertThatThrownBy(() -> tokens(now).verify(token)).isInstanceOfSatisfying(ReconciliationException.class,e -> assertThat(e.status().value()).isEqualTo(400)); }
    @Test void tamperingAndAnotherSecretNeverVerify() {
        var tokens=tokens(now); String token=tokens.sign(tokens.snapshot("group",books));
        assertThatThrownBy(() -> tokens.verify("A"+token.substring(1))).isInstanceOf(ReconciliationException.class);
        var other=new ReviewToken(JsonMapper.builder().addModule(new JavaTimeModule()).build(),new ReviewTokenProperties("another sufficiently long test-only secret",null),Clock.fixed(now,ZoneOffset.UTC));
        assertThatThrownBy(() -> other.verify(token)).isInstanceOf(ReconciliationException.class);
    }
    @Test void exactExpiryBoundaryReturns409() {
        String token=tokens(now).sign(tokens(now).snapshot("group",books));
        assertThatThrownBy(() -> tokens(now.plusSeconds(900)).verify(token)).isInstanceOfSatisfying(ReconciliationException.class,e -> assertThat(e.code()).isEqualTo("RECONCILIATION_EXPIRED"));
    }
    @Test void rejectsUnsafeConfiguration() {
        assertThatThrownBy(() -> new ReviewTokenProperties("short",null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReviewTokenProperties(null,Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
    }
}

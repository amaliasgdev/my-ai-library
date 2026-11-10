package com.mibiblioteca.bookservice.book.photoimport;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.book.cover.CoverTestImages;
import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.*;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(10)
class PhotoRecognitionServiceTest {
    @Test
    void realProviderUsesSameEngineAndNeverFallsBackToMock() {
        var defaults = PhotoTestSupport.properties(true);
        var props = new PhotoImportProperties(true, "openai", defaults.maxFileSize(), defaults.maxWidth(),
            defaults.maxHeight(), defaults.maxPixels(), defaults.maxObservations(), defaults.maxConcurrentAnalyses(), defaults.analysisTimeout());
        var realCalls = new AtomicInteger();
        var mockCalls = new AtomicInteger();
        BookPhotoRecognitionProvider real = new BookPhotoRecognitionProvider() {
            public String id() { return "openai"; }
            public boolean simulated() { return false; }
            public ProviderResult recognize(PhotoImage image) {
                realCalls.incrementAndGet();
                assertThat(image.mediaType()).isEqualTo("image/png");
                throw new PhotoImportException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "PHOTO_CREDENTIALS", "Provider access invalid", null);
            }
        };
        BookPhotoRecognitionProvider mock = new MockBookPhotoRecognitionProvider() {
            @Override public ProviderResult recognize(PhotoImage image) { mockCalls.incrementAndGet(); return super.recognize(image); }
        };
        var service = new PhotoRecognitionService(props, new PhotoSanitizer(props), List.of(real, mock), PhotoTestSupport.environment());
        try {
            assertThat(service.capabilities().mode()).isEqualTo("REAL");
            assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0))
                .isInstanceOfSatisfying(PhotoImportException.class, ex -> assertThat(ex.code()).isEqualTo("PHOTO_CREDENTIALS"));
            assertThat(realCalls).hasValue(1); assertThat(mockCalls).hasValue(0);
        } finally { service.destroy(); }
    }
    @Test
    void disabledCapabilitiesAndRequestNeverInvokeProvider() {
        var props = PhotoTestSupport.properties(false);
        var service = new PhotoRecognitionService(props, new PhotoSanitizer(props), List.of(), PhotoTestSupport.environment());
        assertThat(service.capabilities().enabled()).isFalse();
        assertThat(service.capabilities().mode()).isEqualTo("DISABLED");
        assertThatThrownBy(() -> service.recognize(null, 0)).isInstanceOfSatisfying(PhotoImportException.class,
            ex -> assertThat(ex.status().value()).isEqualTo(503));
    }

    @Test
    void refusesEnabledMockWithoutExclusivelyExplicitDevOrTestProfiles() {
        var props = PhotoTestSupport.properties(true);
        for (String[] profiles : new String[][] {{}, {"prod"}, {"production"}, {"dev", "prod"}, {"test", "staging"}}) {
            assertThatThrownBy(() -> new PhotoRecognitionService(props, new PhotoSanitizer(props),
                List.of(new MockBookPhotoRecognitionProvider()), PhotoTestSupport.environment(profiles)))
                .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> new PhotoRecognitionService(props, new PhotoSanitizer(props), List.of(), PhotoTestSupport.environment("dev")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void reportsExplicitSimulationAndDoesNotInventIsbnOrConfidence() throws Exception {
        var service = service(PhotoTestSupport.properties(true), new MockBookPhotoRecognitionProvider());
        var result = service.recognize(CoverTestImages.png(), 90);
        assertThat(result.provider()).isEqualTo("mock");
        assertThat(result.simulated()).isTrue();
        assertThat(result.requestId()).isNotBlank();
        assertThat(result.observations().getFirst().rawIsbn()).isNull();
        assertThat(result.warnings()).anyMatch(w -> w.contains("SIMULATED"));
        assertThat(service.capabilities().mode()).isEqualTo("SIMULATED");
        assertThat(service.capabilities().maxFileBytes()).isEqualTo(5242880);
    }

    @Test
    void rejectsInvalidRotationBeforeProvider() {
        var service = service(PhotoTestSupport.properties(true), new MockBookPhotoRecognitionProvider());
        assertThatThrownBy(() -> service.recognize(null, 45)).isInstanceOfSatisfying(PhotoImportException.class,
            ex -> assertThat(ex.field()).isEqualTo("rotation"));
    }

    @Test
    void validatesProviderResultsAndNeverRetries() throws Exception {
        var invalid = new java.util.ArrayList<ProviderResult>();
        invalid.add(null);
        invalid.add(new ProviderResult(null, false, List.of()));
        invalid.add(new ProviderResult(java.util.Collections.nCopies(26, observation("1")), false, List.of()));
        invalid.add(new ProviderResult(List.of(observation("1"), observation("1")), false, List.of()));
        invalid.add(new ProviderResult(List.of(new Observation("1", "text", "x".repeat(256), null, null, Legibility.CLEAR, List.of())), false, List.of()));
        invalid.add(new ProviderResult(List.of(observation("1")), false, null));
        invalid.add(new ProviderResult(List.of(new Observation("1", "text", null, null, null, null, List.of())), false, List.of()));
        for (ProviderResult result : invalid) {
            var calls = new AtomicInteger();
            var provider = provider(image -> { calls.incrementAndGet(); return result; });
            var service = service(PhotoTestSupport.properties(true), provider);
            assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0)).isInstanceOfSatisfying(PhotoImportException.class,
                ex -> assertThat(ex.status().value()).isEqualTo(502));
            assertThat(calls).hasValue(1);
        }
    }

    @Test
    void sanitizesProviderFailureAndReleasesCapacity() throws Exception {
        var calls = new AtomicInteger();
        var service = service(PhotoTestSupport.properties(true), provider(image -> {
            if (calls.incrementAndGet() == 1) throw new IllegalStateException("SECRET RESPONSE");
            return new ProviderResult(List.of(), false, List.of());
        }));
        assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0))
            .isInstanceOf(PhotoImportException.class).hasMessage("Photo recognition failed");
        assertThat(service.recognize(CoverTestImages.png(), 0).observations()).isEmpty();
    }

    @Test
    void rejectsConcurrentWorkWithoutQueueingOrExternalCalls() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var calls = new AtomicInteger();
        var service = service(PhotoTestSupport.properties(true), provider(image -> {
            calls.incrementAndGet(); entered.countDown(); release.await();
            return new ProviderResult(List.of(), false, List.of());
        }));
        var first = CompletableFuture.supplyAsync(() -> {
            try { return service.recognize(CoverTestImages.png(), 0); }
            catch (Exception ex) { throw new RuntimeException(ex); }
        });
        try {
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0)).isInstanceOfSatisfying(PhotoImportException.class,
                ex -> assertThat(ex.status().value()).isEqualTo(429));
            assertThat(calls).hasValue(1);
        } finally { release.countDown(); }
        assertThat(first.get(3, TimeUnit.SECONDS).observations()).isEmpty();
    }

    @Test
    void timeoutDoesNotReleaseSlotOfAnUncooperativeProviderOrRetry() throws Exception {
        var release = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        var exited = new CountDownLatch(1);
        var service = service(PhotoTestSupport.properties(true, 6000, 6000, 20000000, Duration.ofMillis(300)), provider(image -> {
            entered.countDown();
            try {
                while (release.getCount() > 0) {
                    try { release.await(); } catch (InterruptedException ignored) { /* Simulate uncooperative code. */ }
                }
                return new ProviderResult(List.of(), false, List.of());
            } finally { exited.countDown(); }
        }));
        try {
            assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0)).isInstanceOfSatisfying(PhotoImportException.class,
                ex -> assertThat(ex.status().value()).isEqualTo(504));
            assertThat(entered.getCount()).isZero();
            assertThatThrownBy(() -> service.recognize(CoverTestImages.png(), 0)).isInstanceOfSatisfying(PhotoImportException.class,
                ex -> assertThat(ex.status().value()).isEqualTo(429));
        } finally { release.countDown(); service.destroy(); }
        assertThat(exited.await(3, TimeUnit.SECONDS)).isTrue();
    }

    private Observation observation(String id) { return new Observation(id, "Visible", null, null, null, Legibility.PARTIAL, List.of()); }

    private PhotoRecognitionService service(PhotoImportProperties props, BookPhotoRecognitionProvider provider) {
        return new PhotoRecognitionService(props, new PhotoSanitizer(props), List.of(provider), PhotoTestSupport.environment("test"));
    }

    private interface Recognition { ProviderResult recognize(BookPhotoRecognitionProvider.PhotoImage image) throws Exception; }

    private BookPhotoRecognitionProvider provider(Recognition operation) {
        return new BookPhotoRecognitionProvider() {
            public String id() { return "mock"; }
            public boolean simulated() { return true; }
            public ProviderResult recognize(PhotoImage image) throws Exception { return operation.recognize(image); }
        };
    }
}

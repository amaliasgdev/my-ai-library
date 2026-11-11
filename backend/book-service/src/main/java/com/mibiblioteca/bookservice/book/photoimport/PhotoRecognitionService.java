package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.*;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@EnableConfigurationProperties(PhotoImportProperties.class)
public class PhotoRecognitionService implements DisposableBean {
    private final PhotoImportProperties properties;
    private final PhotoSanitizer sanitizer;
    private final BookPhotoRecognitionProvider provider;
    private final Semaphore slots;
    private final Set<Thread> workers = ConcurrentHashMap.newKeySet();

    public PhotoRecognitionService(PhotoImportProperties properties, PhotoSanitizer sanitizer,
        List<BookPhotoRecognitionProvider> providers, Environment environment) {
        this.properties = properties;
        this.sanitizer = sanitizer;
        slots = new Semaphore(properties.maxConcurrentAnalyses());
        if (properties.enabled()) {
            String[] profiles = environment.getActiveProfiles();
            if ("mock".equals(properties.provider()) && (profiles.length == 0
                || !Arrays.stream(profiles).allMatch(p -> p.equals("dev") || p.equals("test")))) {
                throw new IllegalArgumentException("Photo import mock requires explicit dev/test profiles only and provider=mock");
            }
            if (!Set.of("mock", "openai").contains(properties.provider())) {
                throw new IllegalArgumentException("Photo provider must be explicitly mock or openai");
            }
            provider = providers.stream().filter(p -> p.id().equals(properties.provider())
                && p.simulated() == "mock".equals(properties.provider())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Configured photo provider is unavailable"));
        } else provider = null;
    }

    public Capabilities capabilities() {
        return new Capabilities(properties.enabled(), provider == null ? "none" : provider.id(),
            provider == null ? "DISABLED" : provider.simulated() ? "SIMULATED" : "REAL", provider != null && provider.simulated(),
            List.of("image/jpeg", "image/png"), properties.maxFileSize().toBytes(), properties.maxWidth(),
            properties.maxHeight(), properties.maxPixels(), properties.maxObservations(),
            properties.maxConcurrentAnalyses(), properties.analysisTimeout().toMillis());
    }

    public RecognitionResponse recognize(MultipartFile file, int rotation) {
        if (provider == null) throw new PhotoImportException(HttpStatus.SERVICE_UNAVAILABLE,
            "PHOTO_DISABLED", "Photo recognition is disabled", null);
        if (rotation != 0 && rotation != 90 && rotation != 180 && rotation != 270) {
            throw PhotoImportException.invalid("rotation must be 0, 90, 180 or 270", "rotation");
        }
        if (!slots.tryAcquire()) throw new PhotoImportException(HttpStatus.TOO_MANY_REQUESTS,
            "PHOTO_BUSY", "Photo processing capacity is busy; retry explicitly later", null);
        var result = new CompletableFuture<RecognitionResponse>();
        String requestId = UUID.randomUUID().toString();
        Thread worker = Thread.ofVirtual().name("photo-analysis").unstarted(() -> {
            RecognitionResponse completed = null;
            Exception failure = null;
            try {
                var image = sanitizer.sanitize(file, rotation);
                if (Thread.currentThread().isInterrupted()) throw PhotoImportException.timeout();
                ProviderResult response = validate(provider.recognize(image));
                completed = new RecognitionResponse(requestId, provider.id(), provider.simulated(),
                    response.observations(), response.incomplete(), response.warnings());
            } catch (Exception ex) {
                failure = ex;
            } finally {
                // A timed-out, uncooperative provider MUST retain its slot until it actually exits.
                slots.release();
                workers.remove(Thread.currentThread());
            }
            if (failure == null) result.complete(completed);
            else result.completeExceptionally(failure);
        });
        workers.add(worker);
        try { worker.start(); }
        catch (RuntimeException ex) { workers.remove(worker); slots.release(); throw ex; }
        try {
            return result.get(properties.analysisTimeout().toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException ex) {
            worker.interrupt();
            throw PhotoImportException.timeout();
        } catch (InterruptedException ex) {
            worker.interrupt();
            Thread.currentThread().interrupt();
            throw PhotoImportException.timeout();
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof PhotoImportException photo) throw photo;
            throw new PhotoImportException(HttpStatus.BAD_GATEWAY, "PHOTO_PROVIDER_FAILED", "Photo recognition failed", null);
        }
    }

    private ProviderResult validate(ProviderResult result) {
        if (result == null || result.observations() == null || result.observations().size() > properties.maxObservations()) {
            throw PhotoImportException.invalidResult();
        }
        validateWarnings(result.warnings());
        var ids = new HashSet<String>();
        for (var observation : result.observations()) {
            if (observation == null || !text(observation.id(), 100, false) || !ids.add(observation.id())
                || !text(observation.visibleText(), 2000, true) || !text(observation.title(), 255, true)
                || !text(observation.author(), 255, true) || !text(observation.rawIsbn(), 50, true)
                || observation.legibility() == null) throw PhotoImportException.invalidResult();
            validateWarnings(observation.warnings());
        }
        return new ProviderResult(result.observations().stream().map(o -> new Observation(o.id(), o.visibleText(),
            o.title(), o.author(), o.rawIsbn(), o.legibility(), List.copyOf(o.warnings()))).toList(),
            result.incomplete(), List.copyOf(result.warnings()));
    }

    private boolean text(String value, int max, boolean nullable) {
        return value == null ? nullable : !value.isBlank() && value.length() <= max
            && value.codePoints().noneMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t');
    }

    private void validateWarnings(List<String> warnings) {
        if (warnings == null || warnings.size() > 10 || warnings.stream().anyMatch(w -> !text(w, 500, false))) {
            throw PhotoImportException.invalidResult();
        }
    }

    @Override
    public void destroy() { workers.forEach(Thread::interrupt); }
}

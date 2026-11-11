package com.mibiblioteca.bookservice.book.lookup;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.http.HttpStatus;

/** One shared pacing gate per client/process, including ISBN lookups and enrichment. */
final class OpenLibraryPacer {
    private long next = System.nanoTime();
    private Instant blockedUntil = Instant.EPOCH;

    void acquire(LookupBudget budget) {
        long wait;
        synchronized (this) {
            if (Instant.now().isBefore(blockedUntil)) {
                long seconds = Math.max(1, Duration.between(Instant.now(), blockedUntil).toSeconds() + 1);
                throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable",
                    "External book provider is temporarily rate limited", Long.toString(seconds));
            }
            long now = System.nanoTime();
            wait = Math.max(0, next - now);
            if (wait >= budget.remaining().toNanos()) throw timeout();
            next = now + wait + Duration.ofSeconds(1).toNanos();
        }
        try { if (wait > 0) java.util.concurrent.TimeUnit.NANOSECONDS.sleep(wait); }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw timeout(); }
        budget.remaining();
        synchronized (this) {
            if (Instant.now().isBefore(blockedUntil)) {
                throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable",
                    "External book provider is temporarily rate limited", Long.toString(Math.max(1,
                        Duration.between(Instant.now(), blockedUntil).toSeconds() + 1)));
            }
        }
    }

    synchronized void backoff(String value) {
        if (value == null) return;
        try {
            Instant until;
            if (value.matches("[0-9]+")) {
                long seconds = Long.parseLong(value);
                try { until = Instant.now().plusSeconds(seconds); }
                catch (java.time.DateTimeException | ArithmeticException ex) { until = Instant.MAX; }
            } else until = ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
            if (until.isAfter(blockedUntil)) blockedUntil = until;
        } catch (RuntimeException ignored) { /* Invalid Retry-After is never used. */ }
    }

    private BookLookupException timeout() {
        return new BookLookupException(HttpStatus.GATEWAY_TIMEOUT, "Book provider timeout", "External book lookup timed out");
    }
}

package com.mibiblioteca.bookservice.book.lookup;

import java.time.Duration;
import java.util.function.LongSupplier;
import org.springframework.http.HttpStatus;

public class LookupBudget {
    private final LongSupplier nanoTime;
    private final long started;
    private final Duration total;

    public LookupBudget(Duration total) {
        this(total, System::nanoTime);
    }

    LookupBudget(Duration total, LongSupplier nanoTime) {
        this.total = total;
        this.nanoTime = nanoTime;
        this.started = nanoTime.getAsLong();
    }

    public Duration remaining() {
        Duration remaining = total.minusNanos(nanoTime.getAsLong() - started);
        if (remaining.isNegative() || remaining.isZero()) {
            throw new BookLookupException(HttpStatus.GATEWAY_TIMEOUT, "Book provider timeout", "External book lookup timed out");
        }
        return remaining;
    }
}

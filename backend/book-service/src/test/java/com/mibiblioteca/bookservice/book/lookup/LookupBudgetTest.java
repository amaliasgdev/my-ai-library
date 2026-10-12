package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LookupBudgetTest {
    @Test
    void shouldShareRemainingTimeAcrossRequestsWithoutRealWaits() {
        AtomicLong clock = new AtomicLong();
        LookupBudget budget = new LookupBudget(Duration.ofSeconds(8), clock::get);
        assertThat(budget.remaining()).isEqualTo(Duration.ofSeconds(8));
        clock.set(Duration.ofSeconds(3).toNanos());
        assertThat(budget.remaining()).isEqualTo(Duration.ofSeconds(5));
        clock.set(Duration.ofSeconds(6).toNanos());
        assertThat(budget.remaining()).isEqualTo(Duration.ofSeconds(2));
        clock.set(Duration.ofSeconds(8).toNanos());
        assertThatThrownBy(budget::remaining).isInstanceOfSatisfying(BookLookupException.class,
            ex -> assertThat(ex.status()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT));
    }
}

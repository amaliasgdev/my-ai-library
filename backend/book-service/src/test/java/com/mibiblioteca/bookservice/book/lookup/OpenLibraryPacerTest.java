package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.*;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.junit.jupiter.api.Test;

class OpenLibraryPacerTest {
    @Test
    void pacingWaitIsPartOfTheBudgetAndNeverRetries() {
        var pacer = new OpenLibraryPacer();
        pacer.acquire(new LookupBudget(Duration.ofSeconds(5)));
        assertThatThrownBy(() -> pacer.acquire(new LookupBudget(Duration.ofMillis(5))))
            .isInstanceOfSatisfying(BookLookupException.class, ex -> assertThat(ex.status().value()).isEqualTo(504));
    }

    @Test
    void honorsBothRetryAfterFormatsAndNeverShortensAnExistingBackoff() {
        for (String value : new String[] {"60", ZonedDateTime.now(java.time.ZoneOffset.UTC).plusMinutes(1).format(DateTimeFormatter.RFC_1123_DATE_TIME)}) {
            var pacer = new OpenLibraryPacer();
            pacer.backoff(value); pacer.backoff("0"); pacer.backoff("invalid");
            assertThatThrownBy(() -> pacer.acquire(new LookupBudget(Duration.ofSeconds(5))))
                .isInstanceOfSatisfying(BookLookupException.class, ex -> {
                    assertThat(ex.status().value()).isEqualTo(503); assertThat(ex.retryAfter()).isNotNull();
                });
        }
    }

    @Test
    void ignoresInvalidAndPastRetryAfterWithoutAnExternalRequest() {
        var pacer = new OpenLibraryPacer();
        pacer.backoff("invalid"); pacer.backoff("-1"); pacer.backoff("Wed, 21 Oct 2015 07:28:00 GMT");
        pacer.acquire(new LookupBudget(Duration.ofSeconds(5)));
    }
}

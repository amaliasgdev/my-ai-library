package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;

class LookupIsbnTest {
    private final IsbnNormalizer normalizer = new IsbnNormalizer();
    private final LookupIsbnValidator validator = new LookupIsbnValidator();

    @ParameterizedTest
    @ValueSource(strings = {"0132350882", "080442957X", "0-8044-2957-x", "9780132350884", "978 0 13 235088 4", "9791090636071"})
    void shouldAcceptValidIsbn(String isbn) {
        assertThat(validator.isValid(normalizer.normalize(isbn))).isTrue();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", "0132350883", "0804429570", "9780132350885", "978013", "9770132350885", "X80442957X", "978013235088X", "12345678901234"})
    void shouldRejectInvalidIsbn(String isbn) {
        assertThat(validator.isValid(normalizer.normalize(isbn))).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"' 978-0-13-235088-4 ',9780132350884", "'0 8044 2957 x',080442957X"})
    void shouldKeepExistingNormalization(String raw, String expected) {
        assertThat(normalizer.normalize(raw)).isEqualTo(expected);
    }
}

package com.mibiblioteca.bookservice.book.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class HttpUrlValidationTest {
    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
        "http://example.com/cover.jpg", "https://example.com/cover.jpg", "HtTpS://example.com/cover.jpg",
        "http://localhost/cover", "http://localhost:8081/cover", "http://127.0.0.1/cover",
        "https://[::1]:443/cover", "https://example.com/cover?size=large&edition=2",
        "https://example.com/cover#front", "https://example.com/cover%20image.jpg?q=%C3%B1",
        "https://example.com:1/cover", "https://example.com:65535/cover"
    })
    void shouldAcceptValidCoverUrl(String url) {
        assertThat(validator.validate(request(url))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "", " ", "\t", " https://example.com/cover", "https://example.com/cover ",
        "https://example.com/cover image.jpg", "https://example.com/cover\u00a0image.jpg",
        "/cover.jpg", "//example.com/cover.jpg", "ftp://example.com/cover.jpg", "file:///cover.jpg",
        "javascript:alert(1)", "https:///cover.jpg", "https://", "https:cover.jpg",
        "https://user:password@example.com/cover", "https://user@example.com/cover",
        "https://example.com:0/cover", "https://example.com:65536/cover", "https://example.com:-1/cover",
        "https://example.com:abc/cover", "https://example.com:/cover", "https://example.com:999999999999/cover",
        "https://example.com/cover%ZZ", "https://example.com/cover%2", "https://[::1/cover",
        "https://invalid_host/cover"
    })
    void shouldRejectInvalidCoverUrl(String url) {
        assertThat(validator.validate(request(url)))
            .anySatisfy(violation -> {
                assertThat(violation.getPropertyPath().toString()).isEqualTo("coverUrl");
                assertThat(violation.getConstraintDescriptor().getAnnotation()).isInstanceOf(HttpUrl.class);
            });
    }

    @Test
    void shouldAccept2048CharactersAndReject2049() {
        String prefix = "https://example.com/";
        String url = prefix + "a".repeat(2048 - prefix.length());
        assertThat(validator.validate(request(url))).isEmpty();
        assertThat(validator.validate(request(url + "a")))
            .singleElement().satisfies(violation -> {
                assertThat(violation.getPropertyPath().toString()).isEqualTo("coverUrl");
                assertThat(violation.getConstraintDescriptor().getAnnotation()).isInstanceOf(jakarta.validation.constraints.Size.class);
            });
    }

    private BookRequest request(String url) {
        return new BookRequest("Clean Code", "Robert C. Martin", null, null, url, null, null, null, null, null);
    }
}

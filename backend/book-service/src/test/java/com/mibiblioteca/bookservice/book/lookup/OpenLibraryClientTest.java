package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenLibraryClientTest {
    private OpenLibraryClient client;
    private MockRestServiceServer server;
    private OpenLibraryRequestFactory factory;

    @BeforeEach
    void setUp() {
        var properties = OpenLibraryMapperTest.properties();
        factory = new OpenLibraryRequestFactory(properties);
        var builder = new OpenLibraryConfig().configuredBuilder(RestClient.builder(), properties, factory);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new OpenLibraryClient(builder.build(), new ObjectMapper(), properties, factory);
    }

    @AfterEach
    void tearDown() {
        factory.close();
    }

    @Test
    void shouldUseCurrentIsbnApiAndConfiguredHeaders() {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andExpect(header("User-Agent", "MyAILibrary")).andExpect(header("Accept", "application/json"))
            .andRespond(withSuccess("{\"key\":\"/books/OL1M\",\"title\":\"Title\"}", MediaType.APPLICATION_JSON));
        assertThat(client.edition("9780132350884", budget()).path("title").asText()).isEqualTo("Title");
        server.verify();
    }

    @Test
    void shouldAllowOneSameHostEditionRedirectAndOneSearch() {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withStatus(HttpStatus.FOUND).location(java.net.URI.create("/books/OL1M.json")));
        server.expect(requestTo("https://openlibrary.org/books/OL1M.json"))
            .andRespond(withSuccess("{\"key\":\"/books/OL1M\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://openlibrary.org/search.json?q=isbn:9780132350884&fields=key,author_name,subject&limit=5"))
            .andRespond(withSuccess("{\"docs\":[]}", MediaType.APPLICATION_JSON));
        LookupBudget budget = budget();
        client.edition("9780132350884", budget);
        assertThat(client.search("9780132350884", budget).path("docs")).isEmpty();
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.example/books/OL1M.json", "https://openlibrary.org/authors/OL1A.json", "/books/OL1M.json?extra=true"})
    void shouldRejectUnsafeRedirectWithoutFollowing(String location) {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withStatus(HttpStatus.FOUND).location(java.net.URI.create(location)));
        assertFailure(() -> client.edition("9780132350884", budget()), 502);
        server.verify();
    }

    @Test
    void shouldNotFollowSecondRedirect() {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withStatus(HttpStatus.FOUND).location(java.net.URI.create("/books/OL1M.json")));
        server.expect(requestTo("https://openlibrary.org/books/OL1M.json"))
            .andRespond(withStatus(HttpStatus.FOUND).location(java.net.URI.create("/books/OL2M.json")));
        assertFailure(() -> client.edition("9780132350884", budget()), 502);
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"404,404", "429,503", "500,503", "503,503", "403,502"})
    void shouldTranslateProviderStatus(int status, int expected) {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withStatus(HttpStatus.valueOf(status)).body("SECRET EXTERNAL BODY"));
        assertFailure(() -> client.edition("9780132350884", budget()), expected);
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{bad", "{}", "[]", "null", "{\"key\":3}", "{\"key\":\"invalid\"}", "{\"key\":\"/books/OL1M\"} trailing"})
    void shouldRejectIncompatiblePrincipalResponse(String body) {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        assertFailure(() -> client.edition("9780132350884", budget()), 502);
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"true,504", "false,503"})
    void shouldTranslateTransportExceptionsWithoutWaiting(boolean timeout, int expected) {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json")).andRespond(request -> {
            if (timeout) { throw new HttpTimeoutException("SECRET TRANSPORT URL"); }
            throw new IOException("SECRET TRANSPORT URL");
        });
        assertFailure(() -> client.edition("9780132350884", budget()), expected);
        server.verify();
    }

    @ParameterizedTest
    @CsvSource(value = {"120,120", "invalid,NULL", "-1,NULL"}, nullValues = "NULL")
    void shouldPropagateOnlyValidRetryAfter(String value, String expected) {
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json"))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", value));
        assertThatThrownBy(() -> client.edition("9780132350884", budget()))
            .isInstanceOfSatisfying(BookLookupException.class, ex -> {
                assertThat(ex.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(ex.retryAfter()).isEqualTo(expected);
            });
        server.verify();
    }

    @Test
    void shouldStopAtExpiredTotalBudgetWithoutSecondCall() {
        AtomicLong clock = new AtomicLong();
        LookupBudget budget = new LookupBudget(Duration.ofSeconds(8), clock::get);
        server.expect(requestTo("https://openlibrary.org/isbn/9780132350884.json")).andRespond(request -> {
            clock.set(Duration.ofSeconds(9).toNanos());
            return withSuccess("{\"key\":\"/books/OL1M\"}", MediaType.APPLICATION_JSON).createResponse(request);
        });
        assertFailure(() -> client.edition("9780132350884", budget), 504);
        server.verify();
    }

    @Test
    void shouldRejectIncompatibleSearchResponse() {
        server.expect(requestTo("https://openlibrary.org/search.json?q=isbn:9780132350884&fields=key,author_name,subject&limit=5"))
            .andRespond(withSuccess("{\"docs\":{}}", MediaType.APPLICATION_JSON));
        assertFailure(() -> client.search("9780132350884", budget()), 502);
        server.verify();
    }

    @Test
    void shouldNotMakeSearchRequestWhenBudgetHasExpired() {
        AtomicLong clock = new AtomicLong();
        LookupBudget budget = new LookupBudget(Duration.ofSeconds(8), clock::get);
        clock.set(Duration.ofSeconds(8).toNanos());
        assertFailure(() -> client.search("9780132350884", budget), 504);
        server.verify();
    }

    private LookupBudget budget() { return new LookupBudget(Duration.ofSeconds(8)); }

    private void assertFailure(Runnable call, int status) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(BookLookupException.class, ex -> {
            assertThat(ex.status().value()).isEqualTo(status);
            assertThat(ex.getMessage()).doesNotContain("SECRET", "openlibrary.org", "evil.example");
        });
    }
}

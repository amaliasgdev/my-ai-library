package com.mibiblioteca.bookservice.book.lookup;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.net.SocketTimeoutException;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;

@Component
public class OpenLibraryClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final OpenLibraryProperties properties;
    private final OpenLibraryRequestFactory requestFactory;

    public OpenLibraryClient(@Qualifier("openLibraryRestClient") RestClient restClient, ObjectMapper objectMapper,
                             OpenLibraryProperties properties, OpenLibraryRequestFactory requestFactory) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.requestFactory = requestFactory;
    }

    public JsonNode edition(String isbn, LookupBudget budget) {
        return request(properties.baseUrl().resolve("/isbn/" + isbn + ".json"), budget, true, true);
    }

    public JsonNode search(String isbn, LookupBudget budget) {
        URI uri = org.springframework.web.util.UriComponentsBuilder.fromUri(properties.baseUrl())
            .replacePath("/search.json").queryParam("q", "isbn:" + isbn)
            .queryParam("fields", "key,author_name,subject").queryParam("limit", 5).build().encode().toUri();
        JsonNode result = request(uri, budget, false, false);
        if (!result.path("docs").isArray()) {
            throw invalidResponse();
        }
        return result;
    }

    private JsonNode request(URI uri, LookupBudget budget, boolean allowRedirect, boolean editionRequest) {
        try {
            // Return redirect information before starting the next bounded request.
            Response response = requestFactory.within(budget.remaining(), () -> restClient.get().uri(uri).exchange((request, upstream) -> {
                int status = upstream.getStatusCode().value();
                if (status >= 300 && status < 400) {
                    return new Response(null, upstream.getHeaders().getFirst("Location"));
                }
                if (status == 404 && editionRequest) {
                    throw new BookLookupException(HttpStatus.NOT_FOUND, "ISBN not found", "No external book edition was found for this ISBN");
                }
                if (status == 429 || status >= 500) {
                    String retryAfter = status == 429 ? validRetryAfter(upstream.getHeaders().getFirst("Retry-After")) : null;
                    throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable",
                        status == 429 ? "External book provider is temporarily rate limited" : "External book provider is unavailable", retryAfter);
                }
                if (status != 200) {
                    throw invalidResponse();
                }
                try {
                    JsonNode node = objectMapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                        .readTree(upstream.getBody());
                    if (node == null || !node.isObject() || node.isEmpty()) {
                        throw invalidResponse();
                    }
                    if (editionRequest && (!node.path("key").isTextual() || !node.path("key").textValue().matches("/books/OL[0-9]+M"))) {
                        throw invalidResponse();
                    }
                    return new Response(node, null);
                } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
                    throw invalidResponse();
                }
            }));
            budget.remaining();
            if (response.document() != null) {
                return response.document();
            }
            if (!allowRedirect || response.location() == null) {
                throw invalidResponse();
            }
            URI redirected;
            try {
                redirected = uri.resolve(response.location());
            } catch (IllegalArgumentException ex) {
                throw invalidResponse();
            }
            URI base = properties.baseUrl();
            if (!base.getScheme().equalsIgnoreCase(redirected.getScheme()) || !base.getHost().equalsIgnoreCase(redirected.getHost())
                || base.getPort() != redirected.getPort() || redirected.getUserInfo() != null
                || redirected.getQuery() != null || redirected.getFragment() != null
                || !redirected.getPath().matches("/books/OL[0-9]+M\\.json")) {
                throw invalidResponse();
            }
            return request(base.resolve(redirected.getPath()), budget, false, true);
        } catch (ResourceAccessException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof HttpTimeoutException || cause instanceof SocketTimeoutException) {
                    throw new BookLookupException(HttpStatus.GATEWAY_TIMEOUT, "Book provider timeout", "External book lookup timed out");
                }
            }
            throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable", "Could not connect to external book provider");
        }
    }

    private String validRetryAfter(String value) {
        if (value == null) { return null; }
        try {
            if (value.matches("[0-9]+")) {
                return Long.parseLong(value) >= 0 ? value : null;
            }
            ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME);
            return value;
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private BookLookupException invalidResponse() {
        return new BookLookupException(HttpStatus.BAD_GATEWAY, "Invalid book provider response", "External book provider returned an incompatible response");
    }

    private record Response(JsonNode document, String location) { }
}

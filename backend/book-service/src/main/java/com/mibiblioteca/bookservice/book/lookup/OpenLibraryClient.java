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
    private final OpenLibraryPacer pacer = new OpenLibraryPacer();

    public JsonNode metadataSearch(String title, String author, LookupBudget budget) {
        return metadataSearch(title, author, null, budget);
    }

    public JsonNode metadataSearch(String title, String author, String language, LookupBudget budget) {
        var builder = org.springframework.web.util.UriComponentsBuilder.fromUri(properties.baseUrl())
            .replacePath("/search.json");
        if (title != null) builder.queryParam("title", "{title}");
        if (author != null) builder.queryParam("author", "{author}");
        var values = new java.util.HashMap<String, String>();
        if (title != null) values.put("title", title);
        if (author != null) values.put("author", author);
        if (language != null) builder.queryParam("lang", language);
        URI uri = builder.queryParam("fields", "key,title,author_name,cover_i,first_publish_year,edition_count")
            .queryParam("limit", 10).encode().buildAndExpand(values).toUri();
        return request(uri, budget, false, false);
    }

    public JsonNode filteredEdition(String workKey, String query, String language, LookupBudget budget) {
        if (workKey == null || !workKey.matches("/works/OL[0-9]{1,12}W")) throw invalidResponse();
        var builder = org.springframework.web.util.UriComponentsBuilder.fromUri(properties.baseUrl())
            .replacePath("/search.json").queryParam("q", "{query}")
            .queryParam("fields", "key,editions,editions.key").queryParam("limit", 1);
        if (language != null) builder.queryParam("lang", language);
        return request(builder.encode().buildAndExpand(java.util.Map.of("query",
            "key:\"" + workKey + "\"" + (query.isEmpty() ? "" : " " + query))).toUri(), budget, false, false);
    }

    public JsonNode metadataEdition(String key, LookupBudget budget) {
        if (!key.matches("/books/OL[0-9]{1,12}M")) throw invalidResponse();
        return request(properties.baseUrl().resolve(key + ".json"), budget, false, false);
    }

    public JsonNode metadataEditions(String workKey, int page, LookupBudget budget) {
        if (!workKey.matches("/works/OL[0-9]{1,12}W") || page < 0 || page > 9) {
            throw new BookLookupException(HttpStatus.BAD_REQUEST, "Invalid metadata request", "Invalid work identifier or page");
        }
        URI uri = org.springframework.web.util.UriComponentsBuilder.fromUri(properties.baseUrl())
            .replacePath(workKey + "/editions.json").queryParam("limit", 10).queryParam("offset", page * 10)
            .build().toUri();
        return request(uri, budget, false, false);
    }

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
            pacer.acquire(budget);
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
                    pacer.backoff(retryAfter);
                    throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable",
                        status == 429 ? "External book provider is temporarily rate limited" : "External book provider is unavailable", retryAfter);
                }
                if (status != 200) {
                    throw invalidResponse();
                }
                try {
                    byte[] body = upstream.getBody().readNBytes(2097153);
                    if (body.length > 2097152) throw invalidResponse();
                    JsonNode node = objectMapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                        .readTree(body);
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

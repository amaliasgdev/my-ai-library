package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.BookServiceApplication;
import com.mibiblioteca.bookservice.book.lookup.OpenLibraryProperties;
import com.mibiblioteca.bookservice.book.lookup.OpenLibraryRequestFactory;
import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.*;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpResponse;

/** Test-classpath only: the registered isolated-DB initializer is mandatory. Never packaged in the JAR. */
public final class PhotoImportOfflineApplication {
    public static void main(String[] args) {
        var app = new SpringApplication(BookServiceApplication.class, Fixtures.class);
        app.setAdditionalProfiles("test");
        app.setDefaultProperties(Map.of(
            "server.address", "127.0.0.1", "server.port", "8082",
            "photo-import.enabled", "true", "photo-import.provider", "mock",
            "spring.flyway.enabled", "false", "spring.jpa.hibernate.ddl-auto", "validate",
            "external.books.open-library.base-url", "https://offline.invalid"));
        app.addInitializers(context -> {
            var env = context.getEnvironment();
            for (var setting : Map.of("photo-import.enabled", "true", "photo-import.provider", "mock",
                    "spring.flyway.enabled", "false", "spring.jpa.hibernate.ddl-auto", "validate",
                    "server.address", "127.0.0.1", "server.port", "8082",
                    "external.books.open-library.base-url", "https://offline.invalid").entrySet()) {
                if (!setting.getValue().equals(env.getProperty(setting.getKey()))) {
                    throw new IllegalStateException("Offline launch requires fixed safe setting: " + setting.getKey());
                }
            }
            if (env.getProperty("OPENAI_API_KEY") != null) {
                throw new IllegalStateException("Offline launch requires a separate shell without OPENAI_API_KEY");
            }
        });
        app.run(args);
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Fixtures {
        @Bean
        @Order(Ordered.HIGHEST_PRECEDENCE)
        BookPhotoRecognitionProvider offlineMultiBookProvider() {
            return new BookPhotoRecognitionProvider() {
                public String id() { return "mock"; }
                public boolean simulated() { return true; }
                public ProviderResult recognize(PhotoImage image) {
                    return new ProviderResult(List.of(
                        new Observation("1", "SIMULATED: DUNE / FRANK HERBERT", "Dune", "Frank Herbert", null, Legibility.CLEAR, List.of()),
                        new Observation("2", "SIMULATED: FOUNDATION / ISAAC ASIMOV", "Foundation", "Isaac Asimov", null, Legibility.PARTIAL,
                            List.of("Fixed offline example, unrelated to the photograph"))),
                        true, List.of("SIMULATED OFFLINE FIXTURE: two examples, possible omissions; no external recognition"));
                }
            };
        }

        @Bean
        @Primary
        OpenLibraryRequestFactory offlineOpenLibraryRequestFactory(OpenLibraryProperties properties) {
            return new OpenLibraryRequestFactory(properties) {
                @Override
                public ClientHttpRequest createRequest(URI uri, HttpMethod method) throws IOException {
                    // No network fallback, including unknown requests and ISBNs.
                    if (method != HttpMethod.GET || !"offline.invalid".equals(uri.getHost())) {
                        throw new IOException("Offline fixture rejected an unexpected provider request");
                    }
                    String body = fixture(uri.getPath());
                    var request = new MockClientHttpRequest(method, uri);
                    var response = new MockClientHttpResponse(body.getBytes(StandardCharsets.UTF_8),
                        body.equals("{}") ? HttpStatus.NOT_FOUND : HttpStatus.OK);
                    response.getHeaders().setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
                    request.setResponse(response);
                    return request;
                }
            };
        }

        private String fixture(String path) {
            return switch (path) {
                case "/search.json" -> """
                    {"numFound":2,"docs":[
                      {"key":"/works/OL100W","title":"Dune","author_name":["Frank Herbert"],"edition_count":1},
                      {"key":"/works/OL200W","title":"Foundation","author_name":["Isaac Asimov"],"edition_count":1}]}
                    """;
                case "/works/OL100W/editions.json" -> "{\"size\":1,\"entries\":[" + edition(true) + "]}";
                case "/works/OL200W/editions.json" -> "{\"size\":1,\"entries\":[" + edition(false) + "]}";
                case "/isbn/9780441172719.json" -> edition(true);
                case "/isbn/9780553293357.json" -> edition(false);
                default -> "{}";
            };
        }
        private String edition(boolean dune) {
            return dune ? """
                {"key":"/books/OL100M","title":"Dune","authors":["Frank Herbert"],
                 "isbn_13":["9780441172719"],"works":[{"key":"/works/OL100W"}],
                 "publishers":["Offline fixture"],"publish_date":"1965","subjects":["Science fiction"]}
                """ : """
                {"key":"/books/OL200M","title":"Foundation","authors":["Isaac Asimov"],
                 "isbn_13":["9780553293357"],"works":[{"key":"/works/OL200W"}],
                 "publishers":["Offline fixture"],"publish_date":"1951","subjects":["Science fiction"]}
                """;
        }
    }
}

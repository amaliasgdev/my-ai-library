package com.mibiblioteca.bookservice.book.cover;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CoverMultipartLimitTest {
    @LocalServerPort private int port;

    @ParameterizedTest
    @ValueSource(ints = {5242881, 6291457})
    void shouldEnforceServletMultipartLimitsAndReturnSafe413(int length) throws Exception {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"SECRET.png\"\r\n"
            + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        if (length > 6291456) {
            body.write(new byte[4194304]);
            body.write(("\r\n--boundary\r\nContent-Disposition: form-data; name=\"extra\"; filename=\"second.png\"\r\n"
                + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            body.write(new byte[length - 4194304]);
        } else { body.write(new byte[length]); }
        body.write("\r\n--boundary--\r\n".getBytes(StandardCharsets.US_ASCII));
        try (HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/books/1/cover"))
                .timeout(Duration.ofSeconds(10)).header("Content-Type", "multipart/form-data; boundary=boundary")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(413);
            assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/problem+json");
            assertThat(new ObjectMapper().readTree(response.body()).path("errors").has("file")).isTrue();
            assertThat(response.body()).doesNotContain("SECRET", "C:\\", "stackTrace");
        }
    }

    @Test
    void shouldReturn400ForMalformedMultipart() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/books/1/cover"))
                .timeout(Duration.ofSeconds(10)).header("Content-Type", "multipart/form-data; boundary=missing")
                .POST(HttpRequest.BodyPublishers.ofString("invalid multipart")).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/problem+json");
        }
    }
}

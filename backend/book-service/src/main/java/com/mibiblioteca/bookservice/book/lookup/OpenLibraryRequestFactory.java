package com.mibiblioteca.bookservice.book.lookup;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.function.Supplier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;

public class OpenLibraryRequestFactory implements ClientHttpRequestFactory, AutoCloseable {
    private final HttpClient client;
    private final OpenLibraryProperties properties;
    private final ThreadLocal<Duration> timeout = new ThreadLocal<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public OpenLibraryRequestFactory(OpenLibraryProperties properties) {
        this.properties = properties;
        this.client = HttpClient.newBuilder().connectTimeout(properties.connectTimeout())
            .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    public <T> T within(Duration remaining, Supplier<T> action) {
        Duration limit = remaining.compareTo(properties.requestTimeout()) < 0 ? remaining : properties.requestTimeout();
        var task = executor.submit(() -> {
            timeout.set(limit);
            try {
                return action.get();
            } finally {
                timeout.remove();
            }
        });
        try {
            return task.get(limit.toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException ex) {
            task.cancel(true);
            throw new BookLookupException(HttpStatus.GATEWAY_TIMEOUT, "Book provider timeout", "External book lookup timed out");
        } catch (InterruptedException ex) {
            task.cancel(true);
            Thread.currentThread().interrupt();
            throw new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Book provider unavailable", "External book lookup was interrupted");
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            if (ex.getCause() instanceof Error error) {
                throw error;
            }
            throw new IllegalStateException(ex.getCause());
        }
    }

    @Override
    public ClientHttpRequest createRequest(URI uri, HttpMethod method) throws IOException {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(timeout.get() == null ? properties.requestTimeout() : timeout.get());
        return factory.createRequest(uri, method);
    }

    @Override
    public void close() {
        executor.shutdownNow();
        client.close();
    }
}

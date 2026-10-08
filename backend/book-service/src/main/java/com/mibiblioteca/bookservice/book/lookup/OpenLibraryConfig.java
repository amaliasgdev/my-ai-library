package com.mibiblioteca.bookservice.book.lookup;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(OpenLibraryProperties.class)
public class OpenLibraryConfig {
    @Bean
    public OpenLibraryRequestFactory openLibraryRequestFactory(OpenLibraryProperties properties) {
        return new OpenLibraryRequestFactory(properties);
    }

    @Bean
    public RestClient openLibraryRestClient(RestClient.Builder builder, OpenLibraryProperties properties,
                                           OpenLibraryRequestFactory requestFactory) {
        return configuredBuilder(builder, properties, requestFactory).build();
    }

    RestClient.Builder configuredBuilder(RestClient.Builder builder, OpenLibraryProperties properties,
                                         OpenLibraryRequestFactory requestFactory) {
        String agent = properties.userAgent();
        if (properties.contact() != null && !properties.contact().isBlank()) {
            agent += " (" + properties.contact() + ")";
        }
        return builder.baseUrl(properties.baseUrl().toString()).requestFactory(requestFactory)
            .defaultHeader("User-Agent", agent).defaultHeader("Accept", "application/json");
    }
}

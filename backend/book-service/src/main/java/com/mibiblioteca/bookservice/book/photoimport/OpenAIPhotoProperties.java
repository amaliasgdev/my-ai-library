package com.mibiblioteca.bookservice.book.photoimport;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Contains no credentials, including in generated toString/binding diagnostics. */
@ConfigurationProperties("photo-import")
public record OpenAIPhotoProperties(
    @DefaultValue("gpt-5.4-mini") String model,
    @DefaultValue("5s") Duration connectTimeout,
    @DefaultValue("40s") Duration requestTimeout,
    @DefaultValue("6000") int maxOutputTokens,
    @DefaultValue("1048576") int maxResponseBytes
) {
    public OpenAIPhotoProperties {
        if (model == null || !model.matches("[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}")
            || connectTimeout == null || connectTimeout.isNegative() || connectTimeout.isZero()
            || connectTimeout.compareTo(Duration.ofSeconds(30)) > 0
            || requestTimeout == null || requestTimeout.isNegative() || requestTimeout.isZero()
            || requestTimeout.compareTo(Duration.ofSeconds(120)) > 0
            || maxOutputTokens < 256 || maxOutputTokens > 16000
            || maxResponseBytes < 1024 || maxResponseBytes > 2097152) {
            throw new IllegalArgumentException("Invalid OpenAI photo model or processing limits");
        }
    }
}

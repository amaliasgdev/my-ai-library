package com.mibiblioteca.bookservice.book.photoimport;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "photo-import", name = "provider", havingValue = "openai")
@EnableConfigurationProperties(OpenAIPhotoProperties.class)
public class OpenAIPhotoConfiguration {
    @Bean
    @ConditionalOnProperty(prefix = "photo-import", name = "enabled", havingValue = "true")
    OpenAIPhotoRecognitionClient openAIPhotoRecognitionClient(OpenAIPhotoProperties config,
        PhotoImportProperties limits, ObjectMapper json, Environment environment, MeterRegistry metrics) {
        return new OpenAIPhotoRecognitionClient(config, limits, json, environment, metrics);
    }
}

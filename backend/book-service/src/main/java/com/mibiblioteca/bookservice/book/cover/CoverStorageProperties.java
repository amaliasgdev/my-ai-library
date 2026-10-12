package com.mibiblioteca.bookservice.book.cover;

import java.net.URI;
import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;
import com.mibiblioteca.bookservice.book.validation.HttpUrlValidator;

@ConfigurationProperties("storage.covers")
public record CoverStorageProperties(
    @DefaultValue("./data/covers") Path directory,
    @DefaultValue("http://localhost:8081/api/covers") URI publicBaseUrl,
    @DefaultValue("5MB") DataSize maxFileSize,
    @DefaultValue("6000") int maxWidth,
    @DefaultValue("6000") int maxHeight,
    @DefaultValue("20000000") long maxPixels
) {
    public CoverStorageProperties {
        if (directory == null || directory.toString().isBlank() || publicBaseUrl == null
            || !new HttpUrlValidator().isValid(publicBaseUrl.toString(), null)
            || publicBaseUrl.getRawQuery() != null || publicBaseUrl.getRawFragment() != null
            || publicBaseUrl.getRawPath().contains("%") || publicBaseUrl.getPath().contains("..")
            || publicBaseUrl.toString().length() > 1900) {
            throw new IllegalArgumentException("Invalid cover storage configuration");
        }
        if (maxFileSize == null || maxFileSize.toBytes() <= 0 || maxFileSize.toBytes() >= Integer.MAX_VALUE
            || maxWidth <= 0 || maxHeight <= 0 || maxPixels <= 0) {
            throw new IllegalArgumentException("Cover limits must be positive and bounded");
        }
    }
}

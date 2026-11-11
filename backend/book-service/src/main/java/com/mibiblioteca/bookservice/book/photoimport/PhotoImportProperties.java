package com.mibiblioteca.bookservice.book.photoimport;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

@ConfigurationProperties("photo-import")
public record PhotoImportProperties(
    @DefaultValue("false") boolean enabled,
    @DefaultValue("none") String provider,
    @DefaultValue("5MB") DataSize maxFileSize,
    @DefaultValue("6000") int maxWidth,
    @DefaultValue("6000") int maxHeight,
    @DefaultValue("20000000") long maxPixels,
    @DefaultValue("25") int maxObservations,
    @DefaultValue("1") int maxConcurrentAnalyses,
    @DefaultValue("45s") Duration analysisTimeout
) {
    public PhotoImportProperties {
        if (maxFileSize == null || maxFileSize.toBytes() <= 0 || maxFileSize.toBytes() > 5242880
            || maxWidth < 1 || maxWidth > 6000 || maxHeight < 1 || maxHeight > 6000
            || maxPixels < 1 || maxPixels > 20000000 || maxObservations < 1 || maxObservations > 100
            || maxConcurrentAnalyses < 1 || maxConcurrentAnalyses > 4 || analysisTimeout == null
            || analysisTimeout.isZero() || analysisTimeout.isNegative() || analysisTimeout.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("Photo import limits must be positive and within safety ceilings");
        }
    }
}

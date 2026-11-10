package com.mibiblioteca.bookservice.book.cover;

import com.mibiblioteca.bookservice.common.image.ImageContentValidator;
import com.mibiblioteca.bookservice.common.image.ImageValidationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class CoverImageValidator {
    private final CoverStorageProperties properties;
    private final ImageContentValidator images = new ImageContentValidator();

    public CoverImageValidator(CoverStorageProperties properties) { this.properties = properties; }

    CoverFormat detect(byte[] bytes) {
        String format = images.detect(bytes);
        return format == null ? null : CoverFormat.valueOf(format);
    }

    public ValidatedCover validate(MultipartFile file) {
        try {
            byte[] bytes = images.read(file, Math.toIntExact(properties.maxFileSize().toBytes()));
            var decoded = images.decode(bytes, file.getContentType(), properties.maxWidth(), properties.maxHeight(), properties.maxPixels());
            decoded.flush();
            return new ValidatedCover(bytes, detect(bytes));
        } catch (ImageValidationException ex) {
            if (ex.status() == HttpStatus.INTERNAL_SERVER_ERROR) throw CoverException.storage();
            throw new CoverException(ex.status(), ex.getMessage(), "file");
        }
    }
}

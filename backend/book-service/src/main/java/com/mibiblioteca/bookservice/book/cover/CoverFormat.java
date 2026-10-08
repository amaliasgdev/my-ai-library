package com.mibiblioteca.bookservice.book.cover;

public enum CoverFormat {
    JPEG("jpg", "image/jpeg"), PNG("png", "image/png");

    private final String extension;
    private final String mediaType;

    CoverFormat(String extension, String mediaType) {
        this.extension = extension;
        this.mediaType = mediaType;
    }

    public String extension() { return extension; }
    public String mediaType() { return mediaType; }
}

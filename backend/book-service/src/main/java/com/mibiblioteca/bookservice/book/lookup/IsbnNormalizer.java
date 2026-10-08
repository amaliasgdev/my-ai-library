package com.mibiblioteca.bookservice.book.lookup;

import org.springframework.stereotype.Component;

@Component
public class IsbnNormalizer {
    public String normalize(String isbn) {
        if (isbn == null || isbn.isBlank()) {
            return null;
        }
        return isbn.replace("-", "").replace(" ", "").trim().toUpperCase();
    }
}

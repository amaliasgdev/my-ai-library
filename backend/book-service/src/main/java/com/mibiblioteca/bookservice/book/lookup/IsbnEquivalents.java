package com.mibiblioteca.bookservice.book.lookup;

import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class IsbnEquivalents {
    private final IsbnNormalizer normalizer;
    private final LookupIsbnValidator validator;

    public IsbnEquivalents(IsbnNormalizer normalizer, LookupIsbnValidator validator) {
        this.normalizer = normalizer;
        this.validator = validator;
    }

    public List<String> valid(String raw) {
        String isbn = normalizer.normalize(raw);
        if (!validator.isValid(isbn)) return List.of();
        if (isbn.length() == 10) {
            String prefix = "978" + isbn.substring(0, 9);
            int sum = 0;
            for (int i = 0; i < 12; i++) sum += (prefix.charAt(i) - '0') * (i % 2 == 0 ? 1 : 3);
            return List.of(isbn, prefix + (10 - sum % 10) % 10);
        }
        if (!isbn.startsWith("978")) return List.of(isbn);
        String prefix = isbn.substring(3, 12);
        int sum = 0;
        for (int i = 0; i < 9; i++) sum += (prefix.charAt(i) - '0') * (10 - i);
        int digit = (11 - sum % 11) % 11;
        return List.of(isbn, prefix + (digit == 10 ? "X" : Integer.toString(digit)));
    }
}

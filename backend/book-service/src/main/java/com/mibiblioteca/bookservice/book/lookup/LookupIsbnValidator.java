package com.mibiblioteca.bookservice.book.lookup;

import org.springframework.stereotype.Component;

@Component
public class LookupIsbnValidator {
    public boolean isValid(String isbn) {
        if (isbn == null) {
            return false;
        }
        if (isbn.matches("[0-9]{9}[0-9X]")) {
            int sum = 0;
            for (int i = 0; i < 10; i++) {
                sum += (10 - i) * (isbn.charAt(i) == 'X' ? 10 : isbn.charAt(i) - '0');
            }
            return sum % 11 == 0;
        }
        if (isbn.matches("97[89][0-9]{10}")) {
            int sum = 0;
            for (int i = 0; i < 13; i++) {
                sum += (isbn.charAt(i) - '0') * (i % 2 == 0 ? 1 : 3);
            }
            return sum % 10 == 0;
        }
        return false;
    }
}

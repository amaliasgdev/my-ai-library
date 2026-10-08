package com.mibiblioteca.bookservice.book.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class DistinctGenresValidator implements ConstraintValidator<DistinctGenres, List<String>> {
    @Override
    public boolean isValid(List<String> values, ConstraintValidatorContext context) {
        if (values == null) {
            return true;
        }
        Set<String> seen = new HashSet<>();
        for (String value : values) {
            if (value != null && !seen.add(value.trim().toLowerCase(Locale.ROOT))) {
                return false;
            }
        }
        return true;
    }
}

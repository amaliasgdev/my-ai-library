package com.mibiblioteca.bookservice.book.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.Locale;
import java.util.Set;

public class IsoLanguageValidator implements ConstraintValidator<IsoLanguage, String> {
    private final Set<String> languages = Set.of(Locale.getISOLanguages());

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || (value.matches("[A-Za-z]{2}") && languages.contains(value.toLowerCase(Locale.ROOT)));
    }
}

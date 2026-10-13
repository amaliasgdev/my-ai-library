package com.mibiblioteca.bookservice.book.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.regex.Pattern;

public class LocationLabelValidator implements ConstraintValidator<LocationLabel, String> {
    private static final Pattern CONTROLS = Pattern.compile("[\\p{Cc}\\p{Zl}\\p{Zp}]");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || !CONTROLS.matcher(value).find();
    }
}

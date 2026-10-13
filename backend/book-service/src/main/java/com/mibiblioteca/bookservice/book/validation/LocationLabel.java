package com.mibiblioteca.bookservice.book.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = LocationLabelValidator.class)
public @interface LocationLabel {
    String message() default "Must be a single-line label without control characters";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

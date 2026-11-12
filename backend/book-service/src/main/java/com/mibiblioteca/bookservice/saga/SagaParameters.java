package com.mibiblioteca.bookservice.saga;

import org.springframework.util.MultiValueMap;

/** Raw query validation for saga writes, before any repository access. */
final class SagaParameters {
    private SagaParameters() {
    }

    static String single(MultiValueMap<String, String> parameters, String field) {
        var values = parameters.get(field);
        if (values == null || values.size() != 1 || values.getFirst() == null || values.getFirst().isEmpty()) {
            throw SagaException.invalidRevision();
        }
        return values.getFirst();
    }

    static long revision(String value) {
        if (value == null || !value.matches("0|[1-9][0-9]{0,18}")) {
            throw SagaException.invalidRevision();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw SagaException.invalidRevision();
        }
    }
}

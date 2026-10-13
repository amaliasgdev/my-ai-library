package com.mibiblioteca.bookservice.book.persistence;

import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.type.StandardBasicTypes;

/** PostgreSQL array membership, deliberately isolated from the other Criteria predicates. */
public class BookFunctionContributor implements FunctionContributor {
    @Override
    public void contributeFunctions(FunctionContributions contributions) {
        contributions.getFunctionRegistry().registerPattern(
            "book_genre_matches",
            "exists (select 1 from unnest(?1) as book_genre(value) where lower(book_genre.value) = lower(?2))",
            contributions.getTypeConfiguration().getBasicTypeRegistry().resolve(StandardBasicTypes.BOOLEAN)
        );
    }
}

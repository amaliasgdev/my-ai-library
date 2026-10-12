package com.mibiblioteca.bookservice.book.lookup;

import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class BookLookupService {
    private final IsbnNormalizer normalizer;
    private final LookupIsbnValidator validator;
    private final OpenLibraryClient client;
    private final OpenLibraryMapper mapper;
    private final OpenLibraryProperties properties;

    public BookLookupService(IsbnNormalizer normalizer, LookupIsbnValidator validator, OpenLibraryClient client,
                             OpenLibraryMapper mapper, OpenLibraryProperties properties) {
        this.normalizer = normalizer;
        this.validator = validator;
        this.client = client;
        this.mapper = mapper;
        this.properties = properties;
    }

    public BookLookupResponse lookup(String rawIsbn) {
        String isbn = normalizer.normalize(rawIsbn);
        if (!validator.isValid(isbn)) {
            throw new BookLookupException(HttpStatus.BAD_REQUEST, "Invalid ISBN", "isbn must be a valid ISBN-10 or ISBN-13 with a correct checksum");
        }
        LookupBudget budget = new LookupBudget(properties.lookupTimeout());
        JsonNode edition = client.edition(isbn, budget);
        JsonNode enrichment = mapper.needsEnrichment(edition) ? client.search(isbn, budget) : null;
        BookLookupResponse result = mapper.map(isbn, edition, enrichment);
        budget.remaining();
        return result;
    }
}

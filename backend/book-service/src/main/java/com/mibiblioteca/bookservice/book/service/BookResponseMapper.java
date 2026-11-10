package com.mibiblioteca.bookservice.book.service;

import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.persistence.Book;
import org.springframework.stereotype.Component;

/** Pure mapping shared by the catalog and reading list; never loads a book. */
@Component
public class BookResponseMapper {
    public BookResponse toResponse(Book book) {
        return new BookResponse(book.getId(), book.getTitle(), book.getAuthor(), book.getIsbn(),
            book.getDescription(), book.getCreatedAt(), book.getUpdatedAt(), book.getReadingStatus(),
            book.getRating(), book.getStartedOn(), book.getFinishedOn(), book.getCoverUrl(),
            book.getPublisher(), book.getPublicationYear(), book.getPageCount(), book.getLanguage(), book.getGenres());
    }
}

package com.mibiblioteca.bookservice.book.api;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingStatusRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateRatingRequest;
import com.mibiblioteca.bookservice.book.dto.ReadingDateRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingDatesRequest;
import com.mibiblioteca.bookservice.book.service.BookService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @PostMapping
    public ResponseEntity<BookResponse> create(@Valid @RequestBody BookRequest request) {
        BookResponse response = bookService.create(request);
        URI location = URI.create("/api/books/" + response.id());
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping
    public List<BookResponse> findAll() {
        return bookService.findAll();
    }

    @GetMapping("/search")
    public List<BookResponse> search(@Valid BookSearchRequest request) {
        return bookService.search(request);
    }

    @GetMapping("/{id}")
    public BookResponse findById(@PathVariable Long id) {
        return bookService.findById(id);
    }

    @PutMapping("/{id}")
    public BookResponse update(@PathVariable Long id, @Valid @RequestBody BookRequest request) {
        return bookService.update(id, request);
    }

    @PatchMapping("/{id}/reading-status")
    public BookResponse updateReadingStatus(
        @PathVariable Long id,
        @Valid @RequestBody UpdateReadingStatusRequest request
    ) {
        return bookService.updateReadingStatus(id, request);
    }

    @PutMapping("/{id}/rating")
    public BookResponse updateRating(@PathVariable Long id, @Valid @RequestBody UpdateRatingRequest request) {
        return bookService.updateRating(id, request);
    }

    @DeleteMapping("/{id}/rating")
    public ResponseEntity<Void> clearRating(@PathVariable Long id) {
        bookService.clearRating(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/start-reading")
    public BookResponse startReading(@PathVariable Long id, @Valid @RequestBody ReadingDateRequest request) {
        return bookService.startReading(id, request);
    }

    @PostMapping("/{id}/finish-reading")
    public BookResponse finishReading(@PathVariable Long id, @Valid @RequestBody ReadingDateRequest request) {
        return bookService.finishReading(id, request);
    }

    @PutMapping("/{id}/reading-dates")
    public BookResponse updateReadingDates(
        @PathVariable Long id,
        @RequestBody UpdateReadingDatesRequest request
    ) {
        return bookService.updateReadingDates(id, request);
    }

    @DeleteMapping("/{id}/reading-dates")
    public ResponseEntity<Void> clearReadingDates(@PathVariable Long id) {
        bookService.clearReadingDates(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        bookService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

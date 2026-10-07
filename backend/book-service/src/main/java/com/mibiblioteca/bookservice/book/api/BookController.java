package com.mibiblioteca.bookservice.book.api;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingStatusRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateRatingRequest;
import com.mibiblioteca.bookservice.book.dto.ReadingDateRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingDatesRequest;
import com.mibiblioteca.bookservice.book.service.BookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
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
@Tag(name = "Books", description = "Book catalog management")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @PostMapping
    @Operation(summary = "Create a book")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Book created"),
        @ApiResponse(responseCode = "400", ref = "BadRequest")
    })
    public ResponseEntity<BookResponse> create(@Valid @RequestBody BookRequest request) {
        BookResponse response = bookService.create(request);
        URI location = URI.create("/api/books/" + response.id());
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping
    @Operation(summary = "List all books")
    public List<BookResponse> findAll() {
        return bookService.findAll();
    }

    @GetMapping("/search")
    @Operation(summary = "Search books", description = "Searches title and author partially without case sensitivity. ISBN cannot be combined with title or author.")
    @ApiResponse(responseCode = "400", ref = "BadRequest")
    public List<BookResponse> search(@Valid @ParameterObject BookSearchRequest request) {
        return bookService.search(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a book by ID")
    @ApiResponse(responseCode = "404", ref = "NotFound")
    public BookResponse findById(@PathVariable Long id) {
        return bookService.findById(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a book")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public BookResponse update(@PathVariable Long id, @Valid @RequestBody BookRequest request) {
        return bookService.update(id, request);
    }

    @PatchMapping("/{id}/reading-status")
    @Operation(summary = "Update reading status", description = "Updates only the reading status; existing reading dates are unchanged.")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public BookResponse updateReadingStatus(
        @PathVariable Long id,
        @Valid @RequestBody UpdateReadingStatusRequest request
    ) {
        return bookService.updateReadingStatus(id, request);
    }

    @PutMapping("/{id}/rating")
    @Operation(summary = "Set a book rating")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public BookResponse updateRating(@PathVariable Long id, @Valid @RequestBody UpdateRatingRequest request) {
        return bookService.updateRating(id, request);
    }

    @DeleteMapping("/{id}/rating")
    @Operation(summary = "Clear a book rating")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Rating cleared"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public ResponseEntity<Void> clearRating(@PathVariable Long id) {
        bookService.clearRating(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/start-reading")
    @Operation(summary = "Start reading a book", description = "Allowed only when the book status is TO_READ; changes it to READING.")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public BookResponse startReading(@PathVariable Long id, @Valid @RequestBody ReadingDateRequest request) {
        return bookService.startReading(id, request);
    }

    @PostMapping("/{id}/finish-reading")
    @Operation(summary = "Finish reading a book", description = "Allowed when the book status is TO_READ or READING; changes it to READ.")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound"),
        @ApiResponse(responseCode = "409", ref = "Conflict")
    })
    public BookResponse finishReading(@PathVariable Long id, @Valid @RequestBody ReadingDateRequest request) {
        return bookService.finishReading(id, request);
    }

    @PutMapping("/{id}/reading-dates")
    @Operation(summary = "Replace reading dates", description = "Replaces both reading dates. At least one date is required and the reading status is unchanged.")
    @ApiResponses({
        @ApiResponse(responseCode = "400", ref = "BadRequest"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public BookResponse updateReadingDates(
        @PathVariable Long id,
        @RequestBody UpdateReadingDatesRequest request
    ) {
        return bookService.updateReadingDates(id, request);
    }

    @DeleteMapping("/{id}/reading-dates")
    @Operation(summary = "Clear reading dates")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Reading dates cleared"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public ResponseEntity<Void> clearReadingDates(@PathVariable Long id) {
        bookService.clearReadingDates(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a book")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Book deleted"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        bookService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

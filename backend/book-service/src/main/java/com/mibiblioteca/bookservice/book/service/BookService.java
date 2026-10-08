package com.mibiblioteca.bookservice.book.service;

import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.dto.BookPageResponse;
import com.mibiblioteca.bookservice.book.dto.BookSearchRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingStatusRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateRatingRequest;
import com.mibiblioteca.bookservice.book.dto.ReadingDateRequest;
import com.mibiblioteca.bookservice.book.dto.UpdateReadingDatesRequest;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.common.exception.BookNotFoundException;
import com.mibiblioteca.bookservice.common.exception.DuplicateIsbnException;
import com.mibiblioteca.bookservice.common.exception.InvalidSearchCriteriaException;
import com.mibiblioteca.bookservice.common.exception.InvalidReadingDatesException;
import com.mibiblioteca.bookservice.common.exception.InvalidReadingTransitionException;
import com.mibiblioteca.bookservice.common.exception.InvalidSortParameterException;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookService {

    private final BookRepository bookRepository;

    public BookService(BookRepository bookRepository) {
        this.bookRepository = bookRepository;
    }

    @Transactional
    public BookResponse create(BookRequest request) {
        String normalizedIsbn = normalizeIsbn(request.isbn());
        validateUniqueIsbnForCreate(normalizedIsbn);

        Book book = new Book();
        book.setTitle(request.title().trim());
        book.setAuthor(request.author().trim());
        book.setIsbn(normalizedIsbn);
        book.setDescription(request.description());

        Book saved = bookRepository.save(book);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public BookPageResponse findAll(int page, int size, String sortBy, Sort.Direction direction) {
        Sort sort = createSort(sortBy, direction);
        Page<Book> books = bookRepository.findAll(PageRequest.of(page, size, sort));

        return toPageResponse(books);
    }

    @Transactional(readOnly = true)
    public BookResponse findById(Long id) {
        Book book = bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
        return toResponse(book);
    }

    @Transactional(readOnly = true)
    public BookPageResponse search(BookSearchRequest request, int page, int size, String sortBy, Sort.Direction direction) {
        String title = normalizeText(request.title());
        String author = normalizeText(request.author());
        String isbn = normalizeIsbn(request.isbn());

        if (isbn != null && (title != null || author != null)) {
            throw new InvalidSearchCriteriaException("isbn cannot be combined with title or author");
        }

        if (isbn == null && title == null && author == null) {
            throw new InvalidSearchCriteriaException("At least one search criterion is required");
        }

        PageRequest pageable = PageRequest.of(page, size, createSort(sortBy, direction));
        Page<Book> books;
        if (isbn != null) {
            books = bookRepository.findByIsbn(isbn, pageable);
        } else if (title != null && author != null) {
            books = bookRepository.findByTitleContainingIgnoreCaseAndAuthorContainingIgnoreCase(title, author, pageable);
        } else if (title != null) {
            books = bookRepository.findByTitleContainingIgnoreCase(title, pageable);
        } else {
            books = bookRepository.findByAuthorContainingIgnoreCase(author, pageable);
        }

        return toPageResponse(books);
    }

    @Transactional
    public BookResponse update(Long id, BookRequest request) {
        Book book = bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
        String normalizedIsbn = normalizeIsbn(request.isbn());
        validateUniqueIsbnForUpdate(normalizedIsbn, id);

        book.setTitle(request.title().trim());
        book.setAuthor(request.author().trim());
        book.setIsbn(normalizedIsbn);
        book.setDescription(request.description());

        Book saved = bookRepository.save(book);
        return toResponse(saved);
    }

    @Transactional
    public BookResponse updateReadingStatus(Long id, UpdateReadingStatusRequest request) {
        Book book = bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
        book.setReadingStatus(request.readingStatus());
        return toResponse(bookRepository.save(book));
    }

    @Transactional
    public BookResponse updateRating(Long id, UpdateRatingRequest request) {
        Book book = bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
        book.setRating(request.rating());
        return toResponse(bookRepository.save(book));
    }

    @Transactional
    public void clearRating(Long id) {
        Book book = bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
        book.setRating(null);
        bookRepository.save(book);
    }

    @Transactional
    public BookResponse startReading(Long id, ReadingDateRequest request) {
        Book book = findBook(id);
        if (book.getReadingStatus() != ReadingStatus.TO_READ) {
            throw new InvalidReadingTransitionException("A book can only be started from TO_READ status");
        }
        validateDateOrder(request.date(), book.getFinishedOn());
        book.setStartedOn(request.date());
        book.setReadingStatus(ReadingStatus.READING);
        return toResponse(bookRepository.save(book));
    }

    @Transactional
    public BookResponse finishReading(Long id, ReadingDateRequest request) {
        Book book = findBook(id);
        if (book.getReadingStatus() != ReadingStatus.TO_READ && book.getReadingStatus() != ReadingStatus.READING) {
            throw new InvalidReadingTransitionException("A book can only be finished from TO_READ or READING status");
        }
        validateDateOrder(book.getStartedOn(), request.date());
        book.setFinishedOn(request.date());
        book.setReadingStatus(ReadingStatus.READ);
        return toResponse(bookRepository.save(book));
    }

    @Transactional
    public BookResponse updateReadingDates(Long id, UpdateReadingDatesRequest request) {
        if (request.startedOn() == null && request.finishedOn() == null) {
            throw new InvalidReadingDatesException("At least one reading date is required");
        }
        validateDateOrder(request.startedOn(), request.finishedOn());
        Book book = findBook(id);
        book.setStartedOn(request.startedOn());
        book.setFinishedOn(request.finishedOn());
        return toResponse(bookRepository.save(book));
    }

    @Transactional
    public void clearReadingDates(Long id) {
        Book book = findBook(id);
        book.setStartedOn(null);
        book.setFinishedOn(null);
        bookRepository.save(book);
    }

    @Transactional
    public void delete(Long id) {
        if (!bookRepository.existsById(id)) {
            throw new BookNotFoundException(id);
        }
        bookRepository.deleteById(id);
    }

    private void validateUniqueIsbnForCreate(String isbn) {
        if (isbn != null && bookRepository.existsByIsbn(isbn)) {
            throw new DuplicateIsbnException(isbn);
        }
    }

    private Book findBook(Long id) {
        return bookRepository.findById(id).orElseThrow(() -> new BookNotFoundException(id));
    }

    private void validateDateOrder(LocalDate startedOn, LocalDate finishedOn) {
        if (startedOn != null && finishedOn != null && finishedOn.isBefore(startedOn)) {
            throw new InvalidReadingDatesException("finishedOn cannot be earlier than startedOn");
        }
    }

    private void validateUniqueIsbnForUpdate(String isbn, Long id) {
        if (isbn != null && bookRepository.existsByIsbnAndIdNot(isbn, id)) {
            throw new DuplicateIsbnException(isbn);
        }
    }

    private String normalizeIsbn(String isbn) {
        if (isbn == null || isbn.isBlank()) {
            return null;
        }
        return isbn.replace("-", "").replace(" ", "").trim().toUpperCase();
    }

    private Sort createSort(String sortBy, Sort.Direction direction) {
        if (!isAllowedSortBy(sortBy)) {
            throw new InvalidSortParameterException(sortBy);
        }

        Sort sort = Sort.by(direction, sortBy);
        return "id".equals(sortBy) ? sort : sort.and(Sort.by(Sort.Direction.ASC, "id"));
    }

    private boolean isAllowedSortBy(String sortBy) {
        return switch (sortBy) {
            case "id", "title", "author", "createdAt", "updatedAt", "readingStatus", "rating", "startedOn", "finishedOn" -> true;
            default -> false;
        };
    }

    private BookPageResponse toPageResponse(Page<Book> books) {
        return new BookPageResponse(
            books.getContent().stream().map(this::toResponse).toList(),
            books.getNumber(),
            books.getSize(),
            books.getTotalElements(),
            books.getTotalPages()
        );
    }

    private String normalizeText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private BookResponse toResponse(Book book) {
        return new BookResponse(
            book.getId(),
            book.getTitle(),
            book.getAuthor(),
            book.getIsbn(),
            book.getDescription(),
            book.getCreatedAt(),
            book.getUpdatedAt(),
            book.getReadingStatus(),
            book.getRating(),
            book.getStartedOn(),
            book.getFinishedOn()
        );
    }
}

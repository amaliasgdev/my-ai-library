package com.mibiblioteca.bookservice.common.exception;

import com.mibiblioteca.bookservice.book.lookup.BookLookupException;
import com.mibiblioteca.bookservice.book.cover.CoverException;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(com.mibiblioteca.bookservice.location.LocationException.class)
    public ProblemDetail handleLocation(com.mibiblioteca.bookservice.location.LocationException ex) {
        var problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        problem.setProperty("code", ex.code());
        if (ex.field() != null) problem.setProperty("errors", Map.of(ex.field(), ex.getMessage()));
        return problem;
    }

    @ExceptionHandler(InvalidBookFilterException.class)
    public ProblemDetail handleBookFilter(InvalidBookFilterException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid catalog filter");
        problem.setTitle("Validation error");
        problem.setProperty("errors", Map.of(ex.field(), ex.getMessage()));
        return problem;
    }

    @ExceptionHandler(CoverException.class)
    public ProblemDetail handleCover(CoverException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        problem.setTitle(ex.status().getReasonPhrase());
        if (ex.field() != null) { problem.setProperty("errors", Map.of(ex.field(), ex.getMessage())); }
        return problem;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail handleUploadSize(MaxUploadSizeExceededException ex) {
        return handleCover(new CoverException(HttpStatus.PAYLOAD_TOO_LARGE, "Multipart upload exceeds the allowed size", "file"));
    }

    @ExceptionHandler({MultipartException.class, MissingServletRequestPartException.class})
    public ProblemDetail handleMultipart(Exception ex) {
        return handleCover(new CoverException(HttpStatus.BAD_REQUEST, "A valid multipart file part is required", "file"));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ProblemDetail handlePersistence(Exception ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation) {
                String constraint = violation.getConstraintName();
                if ("23505".equals(violation.getSQLState()) && java.util.Set.of("uq_room_name", "uq_bookcase_name", "uq_shelf_name").contains(constraint == null ? "" : constraint)) {
                    return handleLocation(new com.mibiblioteca.bookservice.location.LocationException(HttpStatus.CONFLICT, "LOCATION_NAME_CONFLICT", "A location with this name already exists in this parent", "name"));
                }
                if ("23503".equals(violation.getSQLState()) && java.util.Set.of("fk_book_shelf", "fk_shelf_bookcase", "fk_bookcase_room").contains(constraint == null ? "" : constraint)) {
                    return handleLocation(new com.mibiblioteca.bookservice.location.LocationException(HttpStatus.CONFLICT, "LOCATION_IN_USE", "Location changed or is in use; refresh and try again", "location"));
                }
            }
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                && "23505".equals(violation.getSQLState()) && "uq_book_isbn".equals(violation.getConstraintName())) {
                ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "A book with this ISBN already exists");
                problem.setTitle("Duplicate ISBN");
                problem.setProperty("errors", Map.of("isbn", "Already exists"));
                return problem;
            }
        }
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Database operation failed");
    }

    @ExceptionHandler(BookLookupException.class)
    public ResponseEntity<ProblemDetail> handleBookLookup(BookLookupException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        problem.setTitle(ex.title());
        if (ex.status() == HttpStatus.BAD_REQUEST) { problem.setProperty("errors", Map.of("isbn", ex.getMessage())); }
        var response = ResponseEntity.status(ex.status());
        if (ex.retryAfter() != null) { response.header("Retry-After", ex.retryAfter()); }
        return response.body(problem);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ProblemDetail handleMissingParameter(MissingServletRequestParameterException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Required request parameter is missing");
        problem.setTitle("Validation error");
        problem.setProperty("errors", Map.of(ex.getParameterName(), "is required"));
        return problem;
    }

    @ExceptionHandler(BookNotFoundException.class)
    public ProblemDetail handleBookNotFound(BookNotFoundException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problemDetail.setTitle("Book not found");
        return problemDetail;
    }

    @ExceptionHandler(DuplicateIsbnException.class)
    public ProblemDetail handleDuplicateIsbn(DuplicateIsbnException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problemDetail.setTitle("Duplicate ISBN");
        return problemDetail;
    }

    @ExceptionHandler(InvalidSearchCriteriaException.class)
    public ProblemDetail handleInvalidSearchCriteria(InvalidSearchCriteriaException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problemDetail.setTitle("Invalid search criteria");
        return problemDetail;
    }

    @ExceptionHandler(InvalidReadingDatesException.class)
    public ProblemDetail handleInvalidReadingDates(InvalidReadingDatesException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problemDetail.setTitle("Invalid reading dates");
        return problemDetail;
    }

    @ExceptionHandler(InvalidReadingTransitionException.class)
    public ProblemDetail handleInvalidReadingTransition(InvalidReadingTransitionException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problemDetail.setTitle("Invalid reading transition");
        return problemDetail;
    }

    @ExceptionHandler(InvalidSortParameterException.class)
    public ProblemDetail handleInvalidSortParameter(InvalidSortParameterException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problemDetail.setTitle("Invalid sort parameter");
        return problemDetail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        problemDetail.setTitle("Validation error");

        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        problemDetail.setProperty("errors", errors);
        return problemDetail;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableMessage(HttpMessageNotReadableException ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof com.mibiblioteca.bookservice.location.LocationException location) return handleLocation(location);
        }
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request body is invalid");
        problemDetail.setTitle("Invalid request body");
        return problemDetail;
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ProblemDetail handleMethodValidation(HandlerMethodValidationException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request parameter validation failed");
        problemDetail.setTitle("Validation error");
        problemDetail.setProperty("errors", validationErrors(ex));
        return problemDetail;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request parameter has an invalid value");
        problemDetail.setTitle("Invalid request parameter");
        problemDetail.setProperty("errors", Map.of(ex.getName(), "Invalid value"));
        return problemDetail;
    }

    private Map<String, String> validationErrors(HandlerMethodValidationException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (ParameterValidationResult result : ex.getParameterValidationResults()) {
            if (result instanceof ParameterErrors parameterErrors) {
                for (FieldError fieldError : parameterErrors.getFieldErrors()) {
                    errors.put(fieldError.getField(), fieldError.getDefaultMessage());
                }
            } else {
                String parameterName = result.getMethodParameter().getParameterName();
                String message = result.getResolvableErrors().stream()
                    .map(MessageSourceResolvable::getDefaultMessage)
                    .findFirst()
                    .orElse("Invalid value");
                errors.put(parameterName, message);
            }
        }
        return errors;
    }
}

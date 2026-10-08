package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.MethodArgumentNotValidException;

@WebMvcTest(BookController.class)
@Import({BookService.class, com.mibiblioteca.bookservice.book.lookup.IsbnNormalizer.class})
class BookMetadataControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockBean private BookRepository bookRepository;

    @ParameterizedTest
    @MethodSource("validMetadata")
    void shouldAcceptAndNormalizeMetadataOnPostAndPut(String field, Object value, Object expected) throws Exception {
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> {
            Book book = invocation.getArgument(0);
            book.setId(1L);
            return book;
        });
        when(bookRepository.findById(1L)).thenReturn(Optional.of(existingBook()));
        Map<String, Object> body = body();
        body.put(field, value);
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            var result = mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().is2xxSuccessful()).andReturn();
            assertThat(objectMapper.readTree(result.getResponse().getContentAsString()).get(field))
                .isEqualTo(objectMapper.valueToTree(expected));
        }
    }

    static Stream<Arguments> validMetadata() {
        return Stream.of(
            Arguments.of("publisher", null, null), Arguments.of("publisher", " Minotauro ", "Minotauro"),
            Arguments.of("publisher", "", null), Arguments.of("publisher", "   ", null),
            Arguments.of("publisher", "a".repeat(255), "a".repeat(255)),
            Arguments.of("publicationYear", null, null), Arguments.of("publicationYear", 1, 1),
            Arguments.of("publicationYear", 2100, 2100), Arguments.of("pageCount", null, null),
            Arguments.of("pageCount", 1, 1), Arguments.of("pageCount", Integer.MAX_VALUE, Integer.MAX_VALUE),
            Arguments.of("language", null, null), Arguments.of("language", "es", "es"),
            Arguments.of("language", "ES", "es"), Arguments.of("language", "en", "en"),
            Arguments.of("genres", null, List.of()), Arguments.of("genres", List.of(), List.of()),
            Arguments.of("genres", List.of("Fantasía"), List.of("Fantasía")),
            Arguments.of("genres", List.of(" Fantasía ", "Aventura", " Clásicos "), List.of("Fantasía", "Aventura", "Clásicos")),
            Arguments.of("genres", IntStream.range(0, 10).mapToObj(i -> "Genre " + i).toList(),
                IntStream.range(0, 10).mapToObj(i -> "Genre " + i).toList()),
            Arguments.of("genres", List.of("a".repeat(50)), List.of("a".repeat(50)))
        );
    }

    @ParameterizedTest
    @MethodSource("invalidMetadata")
    void shouldReturnFieldErrorsOnPostAndPut(String field, Object value, String errorPath) throws Exception {
        Map<String, Object> body = body();
        body.put(field, value);
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Validation error"))
                .andExpect(jsonPath("$.errors['" + errorPath + "']").isNotEmpty())
                .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(MethodArgumentNotValidException.class));
        }
        verifyNoInteractions(bookRepository);
    }

    static Stream<Arguments> invalidMetadata() {
        return Stream.of(
            Arguments.of("publisher", "a".repeat(256), "publisher"),
            Arguments.of("publicationYear", 0, "publicationYear"), Arguments.of("publicationYear", 2101, "publicationYear"),
            Arguments.of("pageCount", 0, "pageCount"), Arguments.of("pageCount", -1, "pageCount"),
            Arguments.of("language", "", "language"), Arguments.of("language", "  ", "language"),
            Arguments.of("language", "es-ES", "language"), Arguments.of("language", "zz", "language"),
            Arguments.of("genres", IntStream.range(0, 11).mapToObj(i -> "Genre " + i).toList(), "genres"),
            Arguments.of("genres", List.of("a".repeat(51)), "genres[0]"),
            Arguments.of("genres", Arrays.asList((String) null), "genres[0]"),
            Arguments.of("genres", List.of(""), "genres[0]"), Arguments.of("genres", List.of("   "), "genres[0]"),
            Arguments.of("genres", List.of("Fantasía", "Fantasía"), "genres"),
            Arguments.of("genres", List.of("Fantasía", " fantasía "), "genres")
        );
    }

    @ParameterizedTest
    @MethodSource("decimalMetadata")
    void shouldRejectDecimalIntegers(String field) throws Exception {
        Map<String, Object> body = body();
        body.put(field, 1.5);
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.title").value("Invalid request body"));
        }
        verifyNoInteractions(bookRepository);
    }

    static Stream<String> decimalMetadata() {
        return Stream.of("publicationYear", "pageCount");
    }

    @Test
    void shouldDefaultPostAndClearMetadataOmittedOnPutWithoutChangingReadingData() throws Exception {
        when(bookRepository.save(any(Book.class))).thenAnswer(invocation -> {
            Book book = invocation.getArgument(0);
            book.setId(1L);
            return book;
        });
        Book existing = existingBook();
        when(bookRepository.findById(1L)).thenReturn(Optional.of(existing));
        String body = objectMapper.writeValueAsString(body());
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$.publisher").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.publicationYear").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.pageCount").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.language").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.genres").isEmpty())
                .andExpect(jsonPath("$.coverUrl").value("https://example.com/cover.jpg"));
        }
        assertThat(existing.getReadingStatus()).isEqualTo(ReadingStatus.READ);
        assertThat(existing.getRating()).isEqualTo(5);
        assertThat(existing.getStartedOn()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(existing.getFinishedOn()).isEqualTo(LocalDate.of(2026, 10, 7));
    }

    private Map<String, Object> body() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Book");
        body.put("author", "Author");
        body.put("coverUrl", "https://example.com/cover.jpg");
        return body;
    }

    private Book existingBook() {
        Book book = new Book();
        book.setId(1L);
        book.setPublisher("Old Publisher");
        book.setPublicationYear(2000);
        book.setPageCount(100);
        book.setLanguage("en");
        book.setGenres(List.of("Old Genre"));
        book.setCoverUrl("https://example.com/cover.jpg");
        book.setReadingStatus(ReadingStatus.READ);
        book.setRating(5);
        book.setStartedOn(LocalDate.of(2026, 10, 1));
        book.setFinishedOn(LocalDate.of(2026, 10, 7));
        return book;
    }
}

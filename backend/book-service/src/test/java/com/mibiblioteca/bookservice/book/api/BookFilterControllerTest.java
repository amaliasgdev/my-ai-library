package com.mibiblioteca.bookservice.book.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.mibiblioteca.bookservice.book.dto.BookFilterRequest;
import com.mibiblioteca.bookservice.book.dto.BookPageResponse;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookController.class)
class BookFilterControllerTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private BookService service;

    static Stream<Arguments> invalid() {
        return Stream.of(
            Arguments.of("readingStatus", "READ,READING"), Arguments.of("readingStatus", "read"), Arguments.of("readingStatus", ""),
            Arguments.of("ratingMin", "0"), Arguments.of("ratingMin", "6"), Arguments.of("ratingMin", "1.5"), Arguments.of("ratingMin", ""),
            Arguments.of("yearFrom", "0"), Arguments.of("yearTo", "2101"), Arguments.of("yearTo", "abc"), Arguments.of("yearFrom", "999999999999"),
            Arguments.of("yearFrom", ""), Arguments.of("yearTo", ""), Arguments.of("yearFrom", "-1"), Arguments.of("yearTo", "2020.5"),
            Arguments.of("genre", " "), Arguments.of("genre", "g".repeat(51)), Arguments.of("language", "zz"), Arguments.of("language", "es-ES"),
            Arguments.of("language", ""), Arguments.of("publisher", " "), Arguments.of("publisher", "p".repeat(256))
        );
    }
    @ParameterizedTest @MethodSource("invalid") void rejectsInvalidBeforeService(String key, String value) throws Exception {
        for (String path : List.of("/api/books", "/api/books/search")) {
            mvc.perform(get(path).param("title", "a").param(key, value)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json")).andExpect(jsonPath("$.errors." + key).exists());
        }
        verifyNoInteractions(service);
    }
    @Test void rejectsAllRepeatedScalarFilters() throws Exception {
        for (String path : List.of("/api/books", "/api/books/search")) {
            for (String key : List.of("ratingMin", "yearFrom", "yearTo", "genre", "language", "publisher")) {
                mvc.perform(get(path).param("title", "a").param(key, "1", "1"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors." + key).exists());
            }
        }
        verifyNoInteractions(service);
    }
    @Test void rejectsRangeAndExcessiveStates() throws Exception {
        mvc.perform(get("/api/books").param("yearFrom", "2021").param("yearTo", "2020")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.yearTo").exists());
        mvc.perform(get("/api/books").param("readingStatus", "READ", "READ", "READ", "READ", "READ")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.readingStatus").exists());
        verifyNoInteractions(service);
    }
    @Test void passesNormalizedDeduplicatedFiltersToBothEndpoints() throws Exception {
        when(service.findAll(anyInt(), anyInt(), anyString(), any(), any(BookFilterRequest.class))).thenReturn(new BookPageResponse(List.of(), 0, 20, 0, 0));
        when(service.search(any(), anyInt(), anyInt(), anyString(), any(), any(BookFilterRequest.class))).thenReturn(new BookPageResponse(List.of(), 0, 20, 0, 0));
        for (String path : List.of("/api/books", "/api/books/search")) {
            mvc.perform(get(path).param("title", "a").param("readingStatus", "READ", "READING", "READ")
                .param("ratingMin", "4").param("yearFrom", "2020").param("genre", " Terror ").param("language", " ES ").param("publisher", " Press "))
                .andExpect(status().isOk());
        }
        var filters = BookFilterRequest.fromQuery(new org.springframework.util.LinkedMultiValueMap<>(java.util.Map.of(
            "readingStatus", List.of("READ", "READING"), "ratingMin", List.of("4"), "yearFrom", List.of("2020"), "genre", List.of("Terror"), "language", List.of("es"), "publisher", List.of("Press"))));
        verify(service).findAll(eq(0), eq(20), eq("title"), any(), eq(filters));
        verify(service).search(any(), eq(0), eq(20), eq("title"), any(), eq(filters));
    }
}

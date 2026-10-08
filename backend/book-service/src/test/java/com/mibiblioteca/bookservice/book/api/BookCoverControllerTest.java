package com.mibiblioteca.bookservice.book.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.dto.BookPageResponse;
import com.mibiblioteca.bookservice.book.dto.BookRequest;
import com.mibiblioteca.bookservice.book.dto.BookResponse;
import com.mibiblioteca.bookservice.book.service.BookService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.MethodArgumentNotValidException;

@WebMvcTest(BookController.class)
class BookCoverControllerTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockBean private BookService bookService;

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"http://localhost:8080/cover", "https://example.com/covers/clean-code.jpg"})
    void shouldCreateWithOptionalCover(String coverUrl) throws Exception {
        BookRequest request = request(coverUrl);
        when(bookService.create(request)).thenReturn(response(coverUrl));

        var result = mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated()).andReturn();
        assertThat(objectMapper.readTree(result.getResponse().getContentAsString()).get("coverUrl"))
            .isEqualTo(objectMapper.valueToTree(coverUrl));
        verify(bookService).create(request);
    }

    @Test
    void shouldCreateWithoutCoverField() throws Exception {
        when(bookService.create(request(null))).thenReturn(response(null));
        mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(withoutCover()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.nullValue()));
        verify(bookService).create(request(null));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"https://example.com/new-cover.jpg"})
    void shouldReplaceOrClearCoverWithPut(String coverUrl) throws Exception {
        when(bookService.update(1L, request(coverUrl))).thenReturn(response(coverUrl));
        var result = mockMvc.perform(put("/api/books/1").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request(coverUrl))))
            .andExpect(status().isOk()).andReturn();
        assertThat(objectMapper.readTree(result.getResponse().getContentAsString()).get("coverUrl"))
            .isEqualTo(objectMapper.valueToTree(coverUrl));
        verify(bookService).update(1L, request(coverUrl));
    }

    @Test
    void shouldClearCoverWhenOmittedOnPut() throws Exception {
        when(bookService.update(1L, request(null))).thenReturn(response(null));
        mockMvc.perform(put("/api/books/1").contentType(MediaType.APPLICATION_JSON).content(withoutCover()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.nullValue()));
        verify(bookService).update(1L, request(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", " https://example.com/cover", "https://example.com/cover ",
        "/cover.jpg", "ftp://example.com/cover", "https:///cover", "https://user@example.com/cover",
        "https://example.com:0/cover", "https://example.com:65536/cover", "https://example.com/cover%ZZ"})
    void shouldReturn400WithCoverFieldErrorsOnPostAndPut(String coverUrl) throws Exception {
        String body = objectMapper.writeValueAsString(request(coverUrl));
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Validation error"))
                .andExpect(jsonPath("$.errors.coverUrl").value("must be a valid HTTP or HTTPS URL"))
                .andExpect(result -> assertThat(result.getResolvedException()).isInstanceOf(MethodArgumentNotValidException.class));
        }
        verifyNoInteractions(bookService);
    }

    @Test
    void shouldAccept2048AndReject2049Characters() throws Exception {
        String prefix = "https://example.com/";
        String url = prefix + "a".repeat(2048 - prefix.length());
        when(bookService.create(request(url))).thenReturn(response(url));
        mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request(url))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.coverUrl").value(url));
        for (var builder : List.of(post("/api/books"), put("/api/books/1"))) {
            mockMvc.perform(builder.contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(request(url + "a"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.coverUrl").isNotEmpty());
        }
    }

    @Test
    void shouldIncludeCoverInAllReadResponses() throws Exception {
        String coverUrl = "https://example.com/covers/clean-code.jpg";
        BookResponse book = response(coverUrl);
        BookPageResponse page = new BookPageResponse(List.of(book), 0, 20, 1, 1);
        when(bookService.findById(1L)).thenReturn(book);
        when(bookService.findAll(0, 20, "title", Sort.Direction.ASC)).thenReturn(page);
        when(bookService.search(any(), eq(0), eq(20), eq("title"), eq(Sort.Direction.ASC))).thenReturn(page);

        mockMvc.perform(get("/api/books/1")).andExpect(status().isOk()).andExpect(jsonPath("$.coverUrl").value(coverUrl));
        mockMvc.perform(get("/api/books")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].coverUrl").value(coverUrl));
        mockMvc.perform(get("/api/books/search").param("title", "clean"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].coverUrl").value(coverUrl));
    }

    private BookRequest request(String coverUrl) {
        return new BookRequest("Clean Code", "Robert C. Martin", null, null, coverUrl);
    }

    private BookResponse response(String coverUrl) {
        return new BookResponse(1L, "Clean Code", "Robert C. Martin", null, null, Instant.now(), Instant.now(),
            ReadingStatus.TO_READ, null, null, null, coverUrl);
    }

    private String withoutCover() throws Exception {
        return objectMapper.writeValueAsString(Map.of("title", "Clean Code", "author", "Robert C. Martin"));
    }
}

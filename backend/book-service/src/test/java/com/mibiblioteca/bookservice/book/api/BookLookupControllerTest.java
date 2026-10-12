package com.mibiblioteca.bookservice.book.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import com.mibiblioteca.bookservice.book.dto.BookLookupResponse;
import com.mibiblioteca.bookservice.book.lookup.BookLookupException;
import com.mibiblioteca.bookservice.book.lookup.BookLookupService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BookLookupController.class)
class BookLookupControllerTest {
    @Autowired private MockMvc mvc;
    @MockBean private BookLookupService service;

    @Test
    void shouldReturnIndependentPartialProposal() throws Exception {
        when(service.lookup("978-0132350884")).thenReturn(new BookLookupResponse("9780132350884", "Title", null, null, null, null, null, List.of(), null));
        mvc.perform(get("/api/books/isbn-lookup").param("isbn", "978-0132350884"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isbn").value("9780132350884"))
            .andExpect(jsonPath("$.genres").isEmpty()).andExpect(jsonPath("$.id").doesNotExist())
            .andExpect(jsonPath("$.rating").doesNotExist()).andExpect(jsonPath("$.readingStatus").doesNotExist());
    }

    @Test
    void shouldRejectMissingIsbn() throws Exception {
        mvc.perform(get("/api/books/isbn-lookup")).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.isbn").exists());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 404, 502, 503, 504})
    void shouldReturnCoherentProblemDetails(int code) throws Exception {
        when(service.lookup(any())).thenThrow(new BookLookupException(HttpStatus.valueOf(code), "Safe title", "Safe detail"));
        mvc.perform(get("/api/books/isbn-lookup").param("isbn", "9780132350884"))
            .andExpect(status().is(code)).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.status").value(code)).andExpect(jsonPath("$.detail").value("Safe detail"));
    }

    @Test
    void shouldReturn503WithValidUpstreamRetryAfter() throws Exception {
        when(service.lookup(any())).thenThrow(new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE,
            "Book provider unavailable", "External book provider is temporarily rate limited", "120"));
        mvc.perform(get("/api/books/isbn-lookup").param("isbn", "9780132350884"))
            .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After", "120"));
    }
}

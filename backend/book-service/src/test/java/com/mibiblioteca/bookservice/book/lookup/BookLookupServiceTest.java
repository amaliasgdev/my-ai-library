package com.mibiblioteca.bookservice.book.lookup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

class BookLookupServiceTest {
    private final OpenLibraryClient client = mock(OpenLibraryClient.class);
    private final ObjectMapper json = new ObjectMapper();
    private final BookLookupService service = new BookLookupService(new IsbnNormalizer(), new LookupIsbnValidator(),
        client, new OpenLibraryMapper(OpenLibraryMapperTest.properties()), OpenLibraryMapperTest.properties());

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", "9780132350885", "9770132350885", "invalid"})
    void shouldRejectBeforeCallingProvider(String isbn) {
        assertThatThrownBy(() -> service.lookup(isbn)).isInstanceOfSatisfying(BookLookupException.class,
            ex -> assertThat(ex.status()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(client);
    }

    @Test
    void shouldNormalizeAndReturnPartialResultWithoutRepositoryDependency() throws Exception {
        when(client.edition(eq("9780132350884"), any())).thenReturn(json.readTree("{\"key\":\"/books/OL1M\",\"title\":\"Title\"}"));
        var result = service.lookup("978-0-13-235088-4");
        assertThat(result.isbn()).isEqualTo("9780132350884");
        assertThat(result.author()).isNull();
        assertThat(result.genres()).isEmpty();
        assertThat(java.util.Arrays.stream(BookLookupService.class.getConstructors()[0].getParameterTypes()))
            .doesNotContain(com.mibiblioteca.bookservice.book.persistence.BookRepository.class);
        verify(client).edition(eq("9780132350884"), any());
        verifyNoMoreInteractions(client);
    }

    @Test
    void shouldEnrichOnceWhenWorkIsKnown() throws Exception {
        when(client.edition(eq("9780132350884"), any())).thenReturn(json.readTree("{\"key\":\"/books/OL1M\",\"works\":[{\"key\":\"/works/OL1W\"}]}"));
        when(client.search(eq("9780132350884"), any())).thenReturn(json.readTree("{\"docs\":[{\"key\":\"OL1W\",\"author_name\":[\"Author\"],\"subject\":[\"Genre\"]}]}"));
        assertThat(service.lookup("9780132350884").author()).isEqualTo("Author");
        verify(client).search(eq("9780132350884"), any());
    }

    @Test
    void shouldAvoidEnrichmentWhenAuthorsAndGenresArePresent() throws Exception {
        when(client.edition(any(), any())).thenReturn(json.readTree("""
            {"key":"/books/OL1M","authors":[{"name":"Author"}],"subjects":["Genre"],
             "works":[{"key":"/works/OL1W"}]}
            """));
        var result = service.lookup("9780132350884");
        assertThat(result.author()).isEqualTo("Author");
        assertThat(result.genres()).containsExactly("Genre");
        verify(client).edition(eq("9780132350884"), any());
        verifyNoMoreInteractions(client);
    }

    @Test
    void shouldPropagateNotFoundAndProviderFailures() {
        when(client.edition(any(), any())).thenThrow(new BookLookupException(HttpStatus.NOT_FOUND, "ISBN not found", "Not found"));
        assertThatThrownBy(() -> service.lookup("9780132350884")).isInstanceOfSatisfying(BookLookupException.class,
            ex -> assertThat(ex.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void shouldPropagateAttemptedEnrichmentFailure() throws Exception {
        when(client.edition(any(), any())).thenReturn(json.readTree("{\"key\":\"/books/OL1M\",\"works\":[{\"key\":\"/works/OL1W\"}]}"));
        when(client.search(any(), any())).thenThrow(new BookLookupException(HttpStatus.SERVICE_UNAVAILABLE, "Provider unavailable", "Unavailable"));
        assertThatThrownBy(() -> service.lookup("9780132350884")).isInstanceOfSatisfying(BookLookupException.class,
            ex -> assertThat(ex.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }
}

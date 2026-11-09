package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReadingListApiIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private BookRepository books;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManager entityManager;
    @Autowired private ReadingListService service;

    @BeforeEach
    void emptyList() {
        jdbc.update("DELETE FROM public.reading_list_entry");
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @Test
    void emptyListHasStringRevisionAndZeroTotal() throws Exception {
        mvc.perform(get("/api/reading-list")).andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("0"))
            .andExpect(jsonPath("$.totalItems").value(0)).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void appendsAtTheEndWithoutChangingAnyBookDataAndReturnsItsExistingResponse() throws Exception {
        Book first = book("Primero", ReadingStatus.READ);
        Book second = book("Segundo", ReadingStatus.TO_READ);
        String before = bookState(first.getId());
        long entry = add(first.getId(), "0");
        add(second.getId(), "1");
        mvc.perform(get("/api/reading-list")).andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value("2")).andExpect(jsonPath("$.totalItems").value(2))
            .andExpect(jsonPath("$.items[0].entryId").value(entry))
            .andExpect(jsonPath("$.items[0].position").value(1))
            .andExpect(jsonPath("$.items[1].position").value(2))
            .andExpect(jsonPath("$.items[0].book.id").value(first.getId()))
            .andExpect(jsonPath("$.items[0].book.readingStatus").value("READ"))
            .andExpect(jsonPath("$.items[0].book.finishedOn").value("2026-02-02"))
            .andExpect(jsonPath("$.items[0].book.genres[0]").value("Ensayo"));
        assertThat(bookState(first.getId())).isEqualTo(before);
        JsonNode listed = json.readTree(mvc.perform(get("/api/reading-list")).andReturn().getResponse().getContentAsString());
        JsonNode detail = json.readTree(mvc.perform(get("/api/books/{id}", first.getId())).andReturn().getResponse().getContentAsString());
        assertThat(listed.path("items").get(0).path("book")).isEqualTo(detail);
    }

    @Test
    void duplicateMissingBookAndStaleRevisionHaveDistinctErrorsAndNoPartialWrites() throws Exception {
        Book book = book("Único", ReadingStatus.TO_READ);
        add(book.getId(), "0");
        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON)
                .content(body(book.getId(), "1"))).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("READING_LIST_ALREADY_CONTAINS_BOOK"));
        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON)
                .content(body(book.getId(), "0"))).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("READING_LIST_REVISION_CONFLICT"));
        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON)
                .content(body(9007199254740991L, "1"))).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("READING_LIST_BOOK_NOT_FOUND"));
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.revision").value("1"))
            .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    void removesOnlyEntryCompactsAndAppendsUsingNextConsecutivePosition() throws Exception {
        Book first = book("Primero", ReadingStatus.TO_READ);
        Book second = book("Segundo", ReadingStatus.TO_READ);
        Book third = book("Tercero", ReadingStatus.TO_READ);
        add(first.getId(), "0");
        long middle = add(second.getId(), "1");
        add(third.getId(), "2");
        mvc.perform(delete("/api/reading-list/items/{id}", middle).param("expectedRevision", "3"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value("4"));
        assertThat(books.existsById(second.getId())).isTrue();
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.items[1].position").value(2))
            .andExpect(jsonPath("$.items[1].book.id").value(third.getId()));
        add(second.getId(), "4");
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.items[0].position").value(1))
            .andExpect(jsonPath("$.items[1].position").value(2)).andExpect(jsonPath("$.items[2].position").value(3))
            .andExpect(jsonPath("$.revision").value("5"));
        mvc.perform(delete("/api/reading-list/items/{id}", middle).param("expectedRevision", "5"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("READING_LIST_ENTRY_NOT_FOUND"));
        mvc.perform(delete("/api/reading-list/items/{id}", middle).param("expectedRevision", "0"))
            .andExpect(status().isConflict());
    }

    @Test
    void deletingBookThroughExistingCrudCompactsAndIncrementsOnlyIfIncluded() throws Exception {
        Book first = book("Primero", ReadingStatus.TO_READ);
        Book second = book("Segundo", ReadingStatus.TO_READ);
        Book absent = book("Fuera", ReadingStatus.TO_READ);
        add(first.getId(), "0");
        add(second.getId(), "1");
        mvc.perform(delete("/api/books/{id}", first.getId())).andExpect(status().isNoContent());
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.revision").value("3"))
            .andExpect(jsonPath("$.items[0].position").value(1))
            .andExpect(jsonPath("$.items[0].book.id").value(second.getId()));
        mvc.perform(delete("/api/books/{id}", absent.getId())).andExpect(status().isNoContent());
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.revision").value("3"));
    }

    @Test
    void filtersEveryStateWithoutRenumberingOrChangingGlobalTotal() throws Exception {
        int position = 1;
        for (ReadingStatus state : ReadingStatus.values()) {
            Book book = book(state.name(), state);
            add(book.getId(), Integer.toString(position - 1));
            position++;
        }
        position = 1;
        for (ReadingStatus state : ReadingStatus.values()) {
            mvc.perform(get("/api/reading-list").param("readingStatus", state.name()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value("4"))
                .andExpect(jsonPath("$.totalItems").value(4)).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].position").value(position++));
        }
    }

    @Test
    void membershipBatchesDeduplicatesAndReportsAbsentOrNonexistentBooksAsNotIncluded() throws Exception {
        Book included = book("Dentro", ReadingStatus.TO_READ);
        Book absent = book("Fuera", ReadingStatus.TO_READ);
        long entry = add(included.getId(), "0");
        mvc.perform(get("/api/reading-list/membership").param("bookId", included.getId().toString(),
                absent.getId().toString(), included.getId().toString(), "9007199254740991"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value("1"))
            .andExpect(jsonPath("$.items.length()").value(3)).andExpect(jsonPath("$.items[0].included").value(true))
            .andExpect(jsonPath("$.items[0].entryId").value(entry))
            .andExpect(jsonPath("$.items[1].included").value(false)).andExpect(jsonPath("$.items[1].entryId").isEmpty())
            .andExpect(jsonPath("$.items[2].included").value(false));
    }

    @Test
    void allowsOneHundredUniqueIdsAndMoreThanOneHundredDuplicateOccurrences() throws Exception {
        String[] ids = java.util.stream.IntStream.rangeClosed(1, 100).mapToObj(Integer::toString).toArray(String[]::new);
        mvc.perform(get("/api/reading-list/membership").param("bookId", ids)).andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(100));
        ids = java.util.stream.IntStream.rangeClosed(1, 101).mapToObj(Integer::toString).toArray(String[]::new);
        mvc.perform(get("/api/reading-list/membership").param("bookId", ids)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/reading-list/membership").param("bookId", java.util.Collections.nCopies(101, "1").toArray(String[]::new)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    void listAndMembershipUseBoundedQueriesIndependentOfNumberOfBooks() {
        var ids = new java.util.ArrayList<Long>();
        for (int i = 0; i < 12; i++) {
            Book book = book("Libro " + i, ReadingStatus.TO_READ);
            ids.add(book.getId());
            service.add(new ReadingListDtos.AddReadingListItemRequest(book.getId(), Integer.toString(i)));
        }
        entityManager.flush();
        entityManager.clear();
        var statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        try {
            statistics.clear();
            assertThat(service.getList(null).items()).hasSize(12);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
            entityManager.clear();
            statistics.clear();
            assertThat(service.membership(ids).items()).hasSize(12);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
            entityManager.clear();
            statistics.clear();
            assertThat(service.getList(ReadingStatus.TO_READ).items()).hasSize(12);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        } finally { statistics.setStatisticsEnabled(false); }
    }

    @Test
    void reusesExistingReadingEndpointsWithoutInventingDatesOrChangingListRevision() throws Exception {
        Book book = book("Lectura", ReadingStatus.TO_READ);
        add(book.getId(), "0");
        mvc.perform(patch("/api/books/{id}/reading-status", book.getId()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"readingStatus\":\"READ\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/reading-list").param("readingStatus", "READ"))
            .andExpect(jsonPath("$.revision").value("1")).andExpect(jsonPath("$.items[0].book.finishedOn").isEmpty());
        mvc.perform(put("/api/books/{id}/reading-dates", book.getId()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"startedOn\":\"2026-01-01\",\"finishedOn\":\"2026-02-02\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/reading-list")).andExpect(jsonPath("$.items[0].book.finishedOn").value("2026-02-02"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "read", "READ,READING", "ALL", " READ", "null"})
    void rejectsInvalidStateFilters(String state) throws Exception {
        mvc.perform(get("/api/reading-list").param("readingStatus", state)).andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.5", "1e2", "1,2", "", " 1", "9007199254740992", "9223372036854775808"})
    void rejectsInvalidMembershipIds(String value) throws Exception {
        mvc.perform(get("/api/reading-list/membership").param("bookId", value)).andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1", "01", "+1", "1.0", " 0", "1e2", "9223372036854775808"})
    void rejectsInvalidRevisionsOnBothWrites(String revision) throws Exception {
        Book book = book("Libro", ReadingStatus.TO_READ);
        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON).content(body(book.getId(), revision)))
            .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/reading-list/items/1").param("expectedRevision", revision)).andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"bookId\":1}", "{\"bookId\":0,\"expectedRevision\":\"0\"}",
        "{\"bookId\":1.5,\"expectedRevision\":\"0\"}", "{\"bookId\":1,\"expectedRevision\":0}",
        "{\"bookId\":1,\"expectedRevision\":null}", "{\"bookId\":9007199254740992,\"expectedRevision\":\"0\"}"})
    void rejectsInvalidJsonRequests(String body) throws Exception {
        mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsMissingOrRepeatedScalarsAndInvalidEntryIds() throws Exception {
        mvc.perform(get("/api/reading-list/membership")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/reading-list").param("readingStatus", "READ", "READING")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/reading-list/items/1")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/reading-list/items/1").param("expectedRevision", "0", "1")).andExpect(status().isBadRequest());
        for (String id : List.of("0", "-1", "1.5", "abc", "9007199254740992"))
            mvc.perform(delete("/api/reading-list/items/" + id).param("expectedRevision", "0")).andExpect(status().isBadRequest());
    }

    private long add(long bookId, String revision) throws Exception {
        var result = mvc.perform(post("/api/reading-list/items").contentType(MediaType.APPLICATION_JSON).content(body(bookId, revision)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.item.addedAt").isNotEmpty())
            .andExpect(jsonPath("$.revision").value(Long.toString(Long.parseLong(revision) + 1))).andReturn();
        long entryId = json.readTree(result.getResponse().getContentAsString()).path("item").path("entryId").asLong();
        assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/reading-list/items/" + entryId);
        return entryId;
    }

    private String body(long bookId, String revision) throws Exception {
        return json.writeValueAsString(java.util.Map.of("bookId", bookId, "expectedRevision", revision));
    }

    private String bookState(long id) {
        return jdbc.queryForObject("SELECT to_jsonb(book)::text FROM public.book WHERE id=?", String.class, id);
    }

    private Book book(String title, ReadingStatus status) {
        Book book = new Book();
        book.setTitle(title); book.setAuthor("Autora"); book.setReadingStatus(status);
        book.setGenres(List.of("Ensayo")); book.setPublisher("Editorial"); book.setCoverUrl("https://example.org/cover.jpg");
        if (status == ReadingStatus.READ) {
            book.setStartedOn(LocalDate.of(2026, 1, 1)); book.setFinishedOn(LocalDate.of(2026, 2, 2));
        }
        return books.saveAndFlush(book);
    }
}

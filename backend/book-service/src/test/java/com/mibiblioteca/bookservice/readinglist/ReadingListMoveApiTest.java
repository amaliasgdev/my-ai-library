package com.mibiblioteca.bookservice.readinglist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mibiblioteca.bookservice.book.ReadingStatus;
import com.mibiblioteca.bookservice.book.persistence.Book;
import com.mibiblioteca.bookservice.book.persistence.BookRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
class ReadingListMoveApiTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private ReadingListService service;
    @Autowired private BookRepository books;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManager entityManager;

    @BeforeEach
    void emptyList() {
        jdbc.update("DELETE FROM public.reading_list_entry");
        jdbc.update("UPDATE public.reading_list SET revision=0 WHERE id=1");
    }

    @ParameterizedTest
    @CsvSource({"1,5", "5,1", "2,4", "4,2", "2,3", "3,2", "3,3", "1,1", "5,5"})
    void persistsAbsoluteMovesUpdatingOnlyTheAffectedInterval(int from, int to) throws Exception {
        var ids = seed();
        String booksBefore = bookState();
        String metadataBefore = metadata();
        var rowVersions = new ArrayList<String>();
        for (long id : ids) rowVersions.add(rowVersion(id));
        long moved = ids.get(from - 1);
        String revision = from == to ? "5" : "6";
        mvc.perform(post("/api/reading-list/items/{id}/move", moved).contentType(MediaType.APPLICATION_JSON)
                .content(body(to, "5")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(revision))
            .andExpect(jsonPath("$.entryId").value(moved)).andExpect(jsonPath("$.position").value(to));
        entityManager.clear();
        var expected = new ArrayList<>(ids);
        expected.remove(from - 1);
        expected.add(to - 1, moved);
        var confirmed = service.getList(null);
        assertThat(confirmed.items()).extracting(ReadingListDtos.ReadingListItemResponse::entryId).containsExactlyElementsOf(expected);
        assertThat(confirmed.items()).extracting(ReadingListDtos.ReadingListItemResponse::position).containsExactly(1, 2, 3, 4, 5);
        assertThat(confirmed.revision()).isEqualTo(revision);
        assertThat(confirmed.totalItems()).isEqualTo(5);
        assertThat(metadata()).isEqualTo(metadataBefore);
        assertThat(bookState()).isEqualTo(booksBefore);
        for (int index = 0; index < ids.size(); index++) {
            boolean affected = from != to && index + 1 >= Math.min(from, to) && index + 1 <= Math.max(from, to);
            if (affected) assertThat(rowVersion(ids.get(index))).isNotEqualTo(rowVersions.get(index));
            else assertThat(rowVersion(ids.get(index))).isEqualTo(rowVersions.get(index));
        }
        mvc.perform(get("/api/reading-list")).andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value(revision)).andExpect(jsonPath("$.items[" + (to - 1) + "].entryId").value(moved));
    }

    @Test
    void positionIsGlobalEvenWhenAFilteredReadShowsASmallerList() throws Exception {
        var ids = seed();
        mvc.perform(get("/api/reading-list").param("readingStatus", "READ"))
            .andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.items[0].position").value(2)).andExpect(jsonPath("$.items[1].position").value(4));
        // Destination 5 is valid in the complete list, despite only two filtered items.
        mvc.perform(post("/api/reading-list/items/{id}/move", ids.get(1)).contentType(MediaType.APPLICATION_JSON)
            .content(body(5, "5"))).andExpect(status().isOk()).andExpect(jsonPath("$.position").value(5));
        entityManager.clear();
        mvc.perform(get("/api/reading-list").param("readingStatus", "READ"))
            .andExpect(jsonPath("$.totalItems").value(5)).andExpect(jsonPath("$.items[0].position").value(3))
            .andExpect(jsonPath("$.items[1].position").value(5));
    }

    @Test
    void rejectsStaleRevisionsEvenForNoOpAndMissingEntries() throws Exception {
        var ids = seed();
        String before = metadata();
        for (long id : List.of(ids.get(2), 9007199254740991L)) {
            mvc.perform(post("/api/reading-list/items/{id}/move", id).contentType(MediaType.APPLICATION_JSON)
                .content(body(3, "4"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("READING_LIST_REVISION_CONFLICT"));
        }
        assertThat(metadata()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT revision FROM public.reading_list WHERE id=1", Long.class)).isEqualTo(5);
    }

    @Test
    void returns404ForAnAbsentEntryInAnEmptyOrPopulatedList() throws Exception {
        mvc.perform(post("/api/reading-list/items/9007199254740991/move").contentType(MediaType.APPLICATION_JSON)
            .content(body(1, "0"))).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("READING_LIST_ENTRY_NOT_FOUND"));
        seed();
        mvc.perform(post("/api/reading-list/items/9007199254740991/move").contentType(MediaType.APPLICATION_JSON)
            .content(body(1, "5"))).andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1, 6, Integer.MAX_VALUE})
    void rejectsPositionsOutsideTheCurrentCompleteList(int target) throws Exception {
        var ids = seed();
        mvc.perform(post("/api/reading-list/items/{id}/move", ids.getFirst()).contentType(MediaType.APPLICATION_JSON)
            .content(body(target, "5"))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.toPosition").exists());
        assertThat(jdbc.queryForList("SELECT position FROM public.reading_list_entry ORDER BY position", Integer.class))
            .containsExactly(1, 2, 3, 4, 5);
        assertThat(jdbc.queryForObject("SELECT revision FROM public.reading_list WHERE id=1", Long.class)).isEqualTo(5);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"toPosition\":1}", "{\"expectedRevision\":\"0\"}",
        "{\"toPosition\":null,\"expectedRevision\":\"0\"}",
        "{\"toPosition\":1.5,\"expectedRevision\":\"0\"}",
        "{\"toPosition\":2147483648,\"expectedRevision\":\"0\"}",
        "{\"toPosition\":true,\"expectedRevision\":\"0\"}",
        "{\"toPosition\":1,\"expectedRevision\":0}",
        "{\"toPosition\":1,\"expectedRevision\":null}", "{"})
    void rejectsMalformedOrIncompleteJson(String body) throws Exception {
        mvc.perform(post("/api/reading-list/items/1/move").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1", "01", "+1", "1.0", " 0", "1e2", "9223372036854775808"})
    void reusesStrictDecimalRevisionValidation(String revision) throws Exception {
        mvc.perform(post("/api/reading-list/items/1/move").contentType(MediaType.APPLICATION_JSON).content(body(1, revision)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.expectedRevision").exists());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.5", "abc", "9007199254740992"})
    void rejectsInvalidEntryIds(String id) throws Exception {
        mvc.perform(post("/api/reading-list/items/" + id + "/move").contentType(MediaType.APPLICATION_JSON).content(body(1, "0")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.entryId").exists());
    }

    @Test
    void singleEntryNoOpAlsoWorksAtMaximumRevisionWithoutWriting() throws Exception {
        Book book = new Book(); book.setTitle("Único"); book.setAuthor("Autor");
        long id = service.add(new ReadingListDtos.AddReadingListItemRequest(books.saveAndFlush(book).getId(), "0")).item().entryId();
        jdbc.update("UPDATE public.reading_list SET revision=? WHERE id=1", Long.MAX_VALUE);
        entityManager.clear();
        String version = rowVersion(id);
        mvc.perform(post("/api/reading-list/items/{id}/move", id).contentType(MediaType.APPLICATION_JSON)
            .content(body(1, Long.toString(Long.MAX_VALUE)))).andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value(Long.toString(Long.MAX_VALUE))).andExpect(jsonPath("$.position").value(1));
        assertThat(rowVersion(id)).isEqualTo(version);
    }

    private List<Long> seed() {
        var ids = new ArrayList<Long>();
        for (int i = 0; i < 5; i++) {
            Book book = new Book(); book.setTitle("Libro " + i); book.setAuthor("Autora");
            book.setCoverUrl("https://example.org/cover.jpg"); book.setGenres(List.of("Ensayo")); book.setRating(4);
            if (i % 2 == 1) {
                book.setReadingStatus(ReadingStatus.READ);
                book.setStartedOn(LocalDate.of(2026, 1, 1)); book.setFinishedOn(LocalDate.of(2026, 2, 2));
            }
            ids.add(service.add(new ReadingListDtos.AddReadingListItemRequest(books.saveAndFlush(book).getId(), Integer.toString(i))).item().entryId());
        }
        return ids;
    }

    private String body(int position, String revision) throws Exception {
        return json.writeValueAsString(java.util.Map.of("toPosition", position, "expectedRevision", revision));
    }

    private String rowVersion(long id) {
        return jdbc.queryForObject("SELECT ctid::text FROM public.reading_list_entry WHERE id=?", String.class, id);
    }

    private String metadata() {
        return jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(e)-'position' ORDER BY id)::text FROM public.reading_list_entry e", String.class);
    }

    private String bookState() {
        return jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(b) ORDER BY id)::text FROM public.book b", String.class);
    }
}

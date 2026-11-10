package com.mibiblioteca.bookservice.book.photoimport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.mibiblioteca.bookservice.book.cover.CoverTestImages;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Uses the mandatory test-classpath isolated PostgreSQL guard, never the normal datasource. */
@SpringBootTest(properties = {"photo-import.enabled=true", "photo-import.provider=mock",
    "spring.datasource.hikari.maximum-pool-size=2", "spring.datasource.hikari.minimum-idle=0"})
@ActiveProfiles("test")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PhotoRecognitionIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void analysisDoesNotPersistOrModifyCatalogReadingListOrHistory() throws Exception {
        String before = snapshot();
        mvc.perform(get("/api/book-photo-import/capabilities")).andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("SIMULATED"));
        mvc.perform(multipart("/api/book-photo-import/recognize").file(CoverTestImages.png()).param("rotation", "270"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.simulated").value(true));
        assertThat(snapshot()).isEqualTo(before);
    }

    private String snapshot() {
        return jdbc.queryForObject("""
            SELECT jsonb_build_object(
                'books', (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.book b),
                'list', (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.reading_list l),
                'entries', (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.reading_list_entry e),
                'history', (SELECT jsonb_agg(to_jsonb(h) ORDER BY installed_rank) FROM public.flyway_schema_history h)
            )::text
            """, String.class);
    }
}

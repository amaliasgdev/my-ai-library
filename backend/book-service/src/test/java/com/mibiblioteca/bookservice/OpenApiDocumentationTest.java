package com.mibiblioteca.bookservice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocumentationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void apiDocsShouldDescribeBookEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.info.title").value("Mi Biblioteca - Book Service API"))
            .andExpect(jsonPath("$.info.version").value("0.0.1"))
            .andExpect(jsonPath("$.paths['/api/books'].post.responses['201']").exists())
            .andExpect(jsonPath("$.paths['/api/books'].get.parameters[?(@.name == 'page')]").exists())
            .andExpect(jsonPath("$.paths['/api/books'].get.parameters[?(@.name == 'size')]").exists())
            .andExpect(jsonPath("$.paths['/api/books'].get.parameters[?(@.name == 'sortBy')]").exists())
            .andExpect(jsonPath("$.paths['/api/books'].get.parameters[?(@.name == 'direction')]").exists())
            .andExpect(jsonPath("$.components.schemas.BookPageResponse").exists())
            .andExpect(jsonPath("$.paths['/api/books/{id}'].delete.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/books/{id}/reading-dates'].put").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'title')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'author')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'isbn')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'page')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'size')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'sortBy')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'direction')]").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.responses['200'].content['*/*'].schema.$ref").value("#/components/schemas/BookPageResponse"))
            .andExpect(jsonPath("$.paths['/api/books/search'].get.responses['400'].$ref").value("#/components/responses/BadRequest"))
            .andExpect(jsonPath("$.components.schemas.ProblemDetail").exists())
            .andExpect(jsonPath("$.components.responses.BadRequest").exists())
            .andExpect(jsonPath("$.components.responses.NotFound").exists())
            .andExpect(jsonPath("$.components.responses.Conflict").exists())
            .andExpect(jsonPath("$.components.responses.BadRequest.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"))
            .andExpect(jsonPath("$.components.responses.NotFound.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"))
            .andExpect(jsonPath("$.components.responses.Conflict.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"));
    }

    @Test
    void searchShouldDocumentSamePaginationContractAsList() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode paths = objectMapper.readTree(json).path("paths");
        Map<String, JsonNode> listParameters = parametersByName(paths.path("/api/books").path("get"));
        Map<String, JsonNode> searchParameters = parametersByName(paths.path("/api/books/search").path("get"));

        assertThat(searchParameters.keySet()).containsExactlyInAnyOrder("title", "author", "isbn", "page", "size", "sortBy", "direction");
        for (String name : new String[] {"page", "size", "sortBy", "direction"}) {
            assertThat(searchParameters.get(name).path("schema")).isEqualTo(listParameters.get(name).path("schema"));
            assertThat(searchParameters.get(name).path("in").asText()).isEqualTo("query");
            assertThat(searchParameters.get(name).path("required").asBoolean()).isFalse();
        }
        assertThat(searchParameters.get("page").path("schema").path("default").asInt()).isZero();
        assertThat(searchParameters.get("size").path("schema").path("default").asInt()).isEqualTo(20);
        assertThat(paths.path("/api/books/search").path("get").path("description").asText())
            .contains("sortBy=title", "direction=ASC");
    }

    private Map<String, JsonNode> parametersByName(JsonNode operation) {
        Map<String, JsonNode> parameters = new LinkedHashMap<>();
        operation.path("parameters").forEach(parameter -> parameters.put(parameter.path("name").asText(), parameter));
        return parameters;
    }

    @Test
    void shouldDocumentOptionalNullableCoverAndExistingValidationResponses() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode document = objectMapper.readTree(json);
        JsonNode schemas = document.path("components").path("schemas");
        for (String name : new String[] {"BookRequest", "BookResponse"}) {
            JsonNode schema = schemas.path(name);
            JsonNode cover = schema.path("properties").path("coverUrl");
            assertThat(cover.path("format").asText()).isEqualTo("uri");
            assertThat(cover.path("example").asText()).isEqualTo("https://example.com/covers/clean-code.jpg");
            assertThat(cover.path("description").asText()).contains("HTTP/HTTPS", "null");
            assertThat(cover.path("nullable").asBoolean() || cover.path("type").toString().contains("\"null\""))
                .as("%s.coverUrl must be nullable", name).isTrue();
            assertThat(schema.path("required").toString()).doesNotContain("coverUrl");
        }
        assertThat(schemas.path("BookRequest").path("properties").path("coverUrl").path("maxLength").asInt())
            .isEqualTo(2048);
        assertThat(document.path("paths").path("/api/books").path("post").path("responses").path("400").path("$ref").asText())
            .isEqualTo("#/components/responses/BadRequest");
        assertThat(document.path("paths").path("/api/books/{id}").path("put").path("responses").path("400").path("$ref").asText())
            .isEqualTo("#/components/responses/BadRequest");
        assertThat(document.path("paths").has("/api/books/{id}/cover")).isFalse();
    }

    @Test
    void swaggerUiShouldBeAvailable() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/swagger-ui/index.html"));

        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }
}

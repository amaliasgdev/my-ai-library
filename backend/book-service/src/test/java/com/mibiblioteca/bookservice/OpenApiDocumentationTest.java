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
    void retiredModulesAreAbsentAndBookContractsKeepBibliographicAndReadingData() throws Exception {
        JsonNode document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        document.path("paths").fieldNames().forEachRemaining(path -> {
            for (String prefix : new String[] {"/api/locations", "/api/rooms", "/api/bookcases",
                "/api/shelves", "/api/inventory-sessions"}) {
                assertThat(path).doesNotStartWith(prefix);
            }
            assertThat(path).isNotEqualTo("/api/books/{id}/location");
        });
        JsonNode schemas = document.path("components").path("schemas");
        var requestFields = new java.util.ArrayList<String>();
        schemas.path("BookRequest").path("properties").fieldNames().forEachRemaining(requestFields::add);
        assertThat(requestFields).containsExactlyInAnyOrder("title", "author", "isbn", "description",
            "coverUrl", "publisher", "publicationYear", "pageCount", "language", "genres");
        var responseFields = new java.util.ArrayList<String>();
        schemas.path("BookResponse").path("properties").fieldNames().forEachRemaining(responseFields::add);
        assertThat(responseFields).containsExactlyInAnyOrder("id", "title", "author", "isbn", "description",
            "coverUrl", "publisher", "publicationYear", "pageCount", "language", "genres",
            "createdAt", "updatedAt", "readingStatus", "rating", "startedOn", "finishedOn");
        mockMvc.perform(get("/api/locations")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/inventory-sessions/1")).andExpect(status().isNotFound());
    }

    @Test
    void documentsBibliographicWorksEditionsAndAdvisoryDuplicates() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (String endpoint : new String[] {"metadata-search", "metadata-editions", "metadata-duplicates"}) {
            var route = document.path("paths").path("/api/books/" + endpoint);
            assertThat(route.has("get")).isTrue();
            assertThat(route.has("post")).isFalse();
            assertThat(route.path("get").path("responses").has("400")).isTrue();
            assertThat(route.path("get").path("parameters").isArray()).isTrue();
        }
        assertThat(document.path("components").path("schemas").path("Work").path("properties").has("isbn")).isFalse();
        assertThat(document.path("components").path("schemas").path("Work").path("properties").has("firstPublicationYear")).isTrue();
        assertThat(document.path("components").path("schemas").path("Work").path("properties").has("matchKind")).isTrue();
        assertThat(document.path("components").path("schemas").path("Work").path("properties").has("matchedEditionTitle")).isTrue();
        assertThat(document.path("components").path("schemas").path("Works").path("properties").has("resolution")).isTrue();
        assertThat(document.path("components").path("schemas").path("Editions").path("properties").has("partial")).isTrue();
        var searchParams = document.path("paths").path("/api/books/metadata-search").path("get").path("parameters");
        assertThat(searchParams.toString()).contains("\"smart\"", "\"language\"");
        var editionParams = document.path("paths").path("/api/books/metadata-editions").path("get").path("parameters");
        assertThat(editionParams.toString()).contains("\"language\"", "\"publisher\"", "\"year\"", "\"isbn\"");
    }

    @Test
    void documentsExplicitPhotoProvidersWithoutPersistenceOrCredentials() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var paths = document.path("paths");
        assertThat(paths.path("/api/book-photo-import/capabilities").has("get")).isTrue();
        var analyze = paths.path("/api/book-photo-import/recognize").path("post");
        assertThat(paths.path("/api/book-photo-import/capabilities").path("get").path("description").asText())
            .contains("SIMULATED", "REAL", "OpenAI");
        assertThat(analyze.path("description").asText()).contains("EXIF", "OpenAI", "store=false", "No Book creation", "provider cost");
        assertThat(analyze.path("requestBody").path("content").has("multipart/form-data")).isTrue();
        var multipart = analyze.path("requestBody").path("content").path("multipart/form-data").path("schema");
        if (multipart.has("$ref")) {
            multipart = document.path("components").path("schemas").path(multipart.path("$ref").asText().substring("#/components/schemas/".length()));
        }
        assertThat(multipart.path("properties").path("file").path("format").asText()).isEqualTo("binary");
        assertThat(multipart.path("properties").has("rotation")).isTrue();
        assertThat(multipart.path("required").toString()).contains("file", "rotation");
        for (String code : new String[] {"200", "400", "413", "415", "429", "500", "502", "503", "504"}) {
            assertThat(analyze.path("responses").has(code)).isTrue();
        }
        assertThat(analyze.path("responses").path("504").path("content").has("application/problem+json")).isTrue();
        mockMvc.perform(get("/api/book-photo-import/capabilities"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false))
            .andExpect(jsonPath("$.mode").value("DISABLED"));
    }

    @Test
    void documentsReadingListContractsIncludingAbsoluteMoves() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var paths = document.path("paths");
        assertThat(parametersByName(paths.path("/api/reading-list").path("get")).keySet()).containsExactly("readingStatus");
        var membership = parametersByName(paths.path("/api/reading-list/membership").path("get"));
        assertThat(membership.keySet()).containsExactly("bookId");
        assertThat(membership.get("bookId").path("required").asBoolean()).isTrue();
        assertThat(paths.path("/api/reading-list/items").path("post").path("responses").has("201")).isTrue();
        for (String code : new String[] {"400", "404", "409"}) {
            assertThat(paths.path("/api/reading-list/items").path("post").path("responses").has(code)).isTrue();
            assertThat(paths.path("/api/reading-list/items/{entryId}").path("delete").path("responses").has(code)).isTrue();
        }
        assertThat(paths.path("/api/reading-list/items/{entryId}").path("delete").path("responses").has("200")).isTrue();
        assertThat(parametersByName(paths.path("/api/reading-list/items/{entryId}").path("delete")))
            .containsKeys("entryId", "expectedRevision");
        var move = paths.path("/api/reading-list/items/{entryId}/move").path("post");
        for (String code : new String[] {"200", "400", "404", "409"}) assertThat(move.path("responses").has(code)).isTrue();
        assertThat(move.path("description").asText()).contains("complete list", "no-op", "increment revision once");
        var schemas = document.path("components").path("schemas");
        assertThat(schemas.path("ReadingListResponse").path("properties").path("revision").path("type").toString()).contains("\"string\"");
        assertThat(schemas.path("ReadingListItemResponse").path("properties").path("book").path("$ref").asText())
            .isEqualTo("#/components/schemas/BookResponse");
        assertThat(schemas.path("AddReadingListItemRequest").path("required").toString()).contains("bookId", "expectedRevision");
        assertThat(schemas.path("MoveReadingListItemRequest").path("required").toString()).contains("toPosition", "expectedRevision");
        assertThat(schemas.path("ReadingListMoveResponse").path("properties").path("revision").path("type").toString()).contains("\"string\"");
    }

    @Test
    void searchShouldDocumentSamePaginationContractAsList() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode paths = objectMapper.readTree(json).path("paths");
        Map<String, JsonNode> listParameters = parametersByName(paths.path("/api/books").path("get"));
        Map<String, JsonNode> searchParameters = parametersByName(paths.path("/api/books/search").path("get"));

        assertThat(searchParameters.keySet()).containsExactlyInAnyOrder("title", "author", "isbn", "page", "size", "sortBy", "direction", "readingStatus", "ratingMin", "yearFrom", "yearTo", "genre", "genreUnassigned", "language", "publisher");
        for (String name : new String[] {"page", "size", "sortBy", "direction", "readingStatus", "ratingMin", "yearFrom", "yearTo", "genre", "genreUnassigned", "language", "publisher"}) {
            assertThat(searchParameters.get(name).path("schema")).isEqualTo(listParameters.get(name).path("schema"));
            assertThat(searchParameters.get(name).path("in").asText()).isEqualTo("query");
            assertThat(searchParameters.get(name).path("required").asBoolean()).isFalse();
        }
        assertThat(searchParameters.get("page").path("schema").path("default").asInt()).isZero();
        assertThat(searchParameters.get("size").path("schema").path("default").asInt()).isEqualTo(20);
        assertThat(paths.path("/api/books/search").path("get").path("description").asText())
            .contains("sortBy=title", "direction=ASC");
    }

    @Test
    void documentsRepeatedGenreFiltersAndDistinctGenresEndpoint() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var paths = document.path("paths");
        var list = parametersByName(paths.path("/api/books").path("get"));
        var search = parametersByName(paths.path("/api/books/search").path("get"));
        for (Map<String, JsonNode> parameters : java.util.List.of(list, search)) {
            var genre = parameters.get("genre");
            assertThat(genre.path("style").asText()).isEqualTo("form");
            assertThat(genre.path("explode").asBoolean()).isTrue();
            assertThat(genre.path("schema").path("type").asText()).isEqualTo("array");
            assertThat(genre.path("schema").path("items").path("maxLength").asInt()).isEqualTo(50);
            assertThat(genre.path("description").asText()).contains("50", "accent-sensitive");
            var unassigned = parameters.get("genreUnassigned");
            assertThat(unassigned.path("schema").path("type").asText()).isEqualTo("boolean");
            assertThat(unassigned.path("schema").path("default").asBoolean()).isFalse();
            assertThat(unassigned.path("description").asText()).contains("no assigned genres");
        }
        var genres = paths.path("/api/books/genres").path("get");
        assertThat(genres.path("summary").asText()).contains("distinct genres");
        assertThat(genres.path("description").asText()).contains("Accent");
        assertThat(genres.path("responses").path("200").path("content").path("*/*").path("schema").path("type").asText())
            .isEqualTo("array");
    }

    @Test
    void documentsSagaContractsWithPaginationSearchRevisionAndProblemDetails() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var paths = document.path("paths");

        var list = parametersByName(paths.path("/api/sagas").path("get"));
        assertThat(list.keySet()).containsExactlyInAnyOrder("page", "size", "sortBy", "direction", "name");
        assertThat(list.get("page").path("schema").path("default").asInt()).isZero();
        assertThat(list.get("size").path("schema").path("default").asInt()).isEqualTo(20);
        assertThat(list.get("sortBy").path("schema").path("default").asText()).isEqualTo("name");
        assertThat(list.get("direction").path("schema").path("default").asText()).isEqualTo("ASC");
        assertThat(list.get("name").path("required").asBoolean()).isFalse();
        assertThat(list.get("sortBy").toString()).contains("name", "author", "createdAt", "updatedAt");

        assertThat(paths.path("/api/sagas").path("post").path("responses").has("201")).isTrue();
        for (String code : new String[] {"400", "409"}) {
            assertThat(paths.path("/api/sagas").path("post").path("responses").has(code)).isTrue();
        }
        assertThat(paths.path("/api/sagas/{id}").path("get").path("responses").has("404")).isTrue();
        assertThat(paths.path("/api/sagas/{id}").path("put").path("responses").has("409")).isTrue();
        assertThat(paths.path("/api/sagas/{id}").path("delete").path("responses").has("204")).isTrue();

        var update = parametersByName(paths.path("/api/sagas/{id}").path("put"));
        assertThat(update).containsKeys("id", "expectedRevision");
        assertThat(update.get("expectedRevision").path("required").asBoolean()).isTrue();
        assertThat(update.get("expectedRevision").path("schema").path("type").asText()).isEqualTo("string");
        var deletion = parametersByName(paths.path("/api/sagas/{id}").path("delete"));
        assertThat(deletion).containsKeys("id", "expectedRevision");
        assertThat(deletion.get("expectedRevision").path("required").asBoolean()).isTrue();

        var schemas = document.path("components").path("schemas");
        assertThat(schemas.path("SagaRequest").path("required").toString()).contains("name");
        assertThat(schemas.path("SagaRequest").path("properties").path("name").path("maxLength").asInt())
            .isEqualTo(255);
        assertThat(schemas.path("SagaRequest").path("properties").path("imageUrl").path("maxLength").asInt())
            .isEqualTo(2048);
        assertThat(schemas.path("SagaResponse").path("properties").path("revision").path("type").toString())
            .contains("\"string\"");
        assertThat(schemas.path("SagaProgressResponse").path("properties").size()).isEqualTo(7);
        assertThat(schemas.path("SagaPageResponse").path("properties").has("content")).isTrue();

        var bookSagas = paths.path("/api/books/{id}/sagas").path("get");
        assertThat(bookSagas.has("responses")).isTrue();
        assertThat(bookSagas.path("responses").has("200")).isTrue();
        assertThat(bookSagas.path("responses").has("404")).isTrue();
        assertThat(bookSagas.path("description").asText()).contains("ordered", "empty array", "BookResponse");
        assertThat(fieldNames(schemas.path("BookSagaResponse").path("properties")))
            .containsExactlyInAnyOrder("sagaId", "sagaName", "volumeId", "position", "volumeLabel");
    }

    @Test
    void documentsSagaVolumeContractsIncludingLinksMovesAndRevisions() throws Exception {
        var document = objectMapper.readTree(mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var paths = document.path("paths");
        var collection = paths.path("/api/sagas/{sagaId}/volumes");
        var volume = paths.path("/api/sagas/{sagaId}/volumes/{volumeId}");

        assertThat(collection.has("get")).isTrue();
        assertThat(collection.path("post").path("responses").has("201")).isTrue();
        assertThat(collection.path("post").path("responses").has("409")).isTrue();
        assertThat(volume.has("put")).isTrue();
        assertThat(volume.path("delete").path("responses").has("200")).isTrue();
        assertThat(paths.path("/api/sagas/{sagaId}/volumes/{volumeId}/move").path("post").path("responses").has("200")).isTrue();
        assertThat(paths.path("/api/sagas/{sagaId}/volumes/{volumeId}/link").path("post").path("responses").has("200")).isTrue();
        assertThat(paths.path("/api/sagas/{sagaId}/volumes/{volumeId}/unlink").path("post").path("responses").has("200")).isTrue();

        var deletion = parametersByName(volume.path("delete"));
        assertThat(deletion).containsKeys("sagaId", "volumeId", "expectedRevision");
        assertThat(deletion.get("expectedRevision").path("required").asBoolean()).isTrue();
        assertThat(deletion.get("expectedRevision").path("schema").path("type").asText()).isEqualTo("string");

        var schemas = document.path("components").path("schemas");
        assertThat(schemas.path("AddSagaVolumeRequest").path("required").toString())
            .contains("expectedRevision")
            .doesNotContain("bookId", "pendingTitle");
        assertThat(schemas.path("AddSagaVolumeRequest").path("properties").path("volumeLabel").path("maxLength").asInt())
            .isEqualTo(40);
        assertThat(fieldNames(schemas.path("SagaVolumesResponse").path("properties")))
            .containsExactlyInAnyOrder("revision", "progress", "volumes");
        assertThat(schemas.path("SagaVolumesResponse").path("properties").path("revision").path("type").toString())
            .contains("\"string\"");
        assertThat(fieldNames(schemas.path("SagaVolumeResponse").path("properties")))
            .contains("id", "position", "volumeLabel", "bookId", "book", "pendingTitle");
        assertThat(schemas.path("SagaVolumeResponse").path("properties").path("book").path("$ref").asText())
            .isEqualTo("#/components/schemas/SagaVolumeBookResponse");
        assertThat(schemas.path("MoveSagaVolumeRequest").path("required").toString())
            .contains("toPosition", "expectedRevision");
    }

    private Map<String, JsonNode> parametersByName(JsonNode operation) {
        Map<String, JsonNode> parameters = new LinkedHashMap<>();
        operation.path("parameters").forEach(parameter -> parameters.put(parameter.path("name").asText(), parameter));
        return parameters;
    }

    private java.util.List<String> fieldNames(JsonNode node) {
        var names = new java.util.ArrayList<String>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
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
        assertThat(document.path("paths").has("/api/books/{id}/cover")).isTrue();
    }

    @Test
    void swaggerUiShouldBeAvailable() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/swagger-ui/index.html"));

        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }

    @Test
    void shouldDocumentMultipartUploadDeletionAndBinaryCoverReading() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode document = objectMapper.readTree(json);
        JsonNode paths = document.path("paths");
        JsonNode upload = paths.path("/api/books/{id}/cover").path("post");
        assertThat(upload.path("description").asText()).contains("JPEG", "PNG", "5 MiB", "5242880");
        JsonNode multipart = upload.path("requestBody").path("content").path("multipart/form-data").path("schema");
        if (multipart.has("$ref")) {
            multipart = document.path("components").path("schemas").path(multipart.path("$ref").asText().substring("#/components/schemas/".length()));
        }
        assertThat(multipart.path("properties").path("file").path("format").asText()).isEqualTo("binary");
        assertThat(multipart.path("required").toString()).contains("file");
        for (String response : new String[] {"200", "400", "404", "413", "415", "500"}) {
            assertThat(upload.path("responses").has(response)).isTrue();
        }
        assertThat(upload.path("responses").path("200").toString()).contains("#/components/schemas/BookResponse");
        JsonNode deletion = paths.path("/api/books/{id}/cover").path("delete");
        for (String response : new String[] {"204", "404", "500"}) { assertThat(deletion.path("responses").has(response)).isTrue(); }
        JsonNode reading = paths.path("/api/covers/{filename}").path("get").path("responses");
        for (String mime : new String[] {"image/jpeg", "image/png"}) {
            assertThat(reading.path("200").path("content").path(mime).path("schema").path("format").asText()).isEqualTo("binary");
        }
        assertThat(reading.has("404")).isTrue();
    }

    @Test
    void shouldDocumentConsultativeIsbnLookup() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode document = objectMapper.readTree(json);
        JsonNode operation = document.path("paths").path("/api/books/isbn-lookup").path("get");
        assertThat(parametersByName(operation).get("isbn").path("required").asBoolean()).isTrue();
        assertThat(operation.path("description").asText()).contains("Open Library", "Partial", "spaces and hyphens", "does not read or write");
        for (String status : new String[] {"200", "400", "404", "502", "503", "504"}) {
            assertThat(operation.path("responses").has(status)).isTrue();
        }
        assertThat(operation.path("responses").path("200").path("content").path("application/json").path("schema").path("$ref").asText())
            .isEqualTo("#/components/schemas/BookLookupResponse");
        JsonNode fields = document.path("components").path("schemas").path("BookLookupResponse").path("properties");
        assertThat(fields.size()).isEqualTo(9);
        assertThat(fields.has("id") || fields.has("readingStatus") || fields.has("createdAt")).isFalse();
    }

    @Test
    void shouldDocumentMetadataAndValidationLimits() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode document = objectMapper.readTree(json);
        JsonNode schemas = document.path("components").path("schemas");
        for (String name : new String[] {"BookRequest", "BookResponse"}) {
            JsonNode schema = schemas.path(name);
            JsonNode properties = schema.path("properties");
            for (String field : new String[] {"publisher", "publicationYear", "pageCount", "language", "genres"}) {
                assertThat(properties.has(field)).isTrue();
                assertThat(schema.path("required").toString()).doesNotContain("\"" + field + "\"");
            }
            assertThat(properties.path("language").path("description").asText()).contains("ISO 639-1");
            assertThat(properties.path("language").path("example").asText()).isEqualTo("es");
            assertThat(properties.path("genres").path("type").toString()).contains("\"array\"");
            assertThat(properties.path("genres").path("items").path("type").asText()).isEqualTo("string");
        }
        JsonNode request = schemas.path("BookRequest").path("properties");
        assertThat(request.path("publisher").path("maxLength").asInt()).isEqualTo(255);
        assertThat(request.path("publicationYear").path("minimum").asInt()).isEqualTo(1);
        assertThat(request.path("publicationYear").path("maximum").asInt()).isEqualTo(2100);
        assertThat(request.path("pageCount").has("exclusiveMinimum")).isTrue();
        assertThat(request.path("pageCount").path("exclusiveMinimum").asInt()).isZero();
        assertThat(request.path("genres").path("maxItems").asInt()).isEqualTo(10);
        assertThat(request.path("genres").path("items").path("maxLength").asInt()).as("genres schema: %s", request.path("genres")).isEqualTo(50);
        assertThat(request.path("genres").path("description").asText()).contains("Duplicates", "trimmed");
        assertThat(document.path("paths").has("/api/books/{id}/metadata")).isFalse();
    }
}

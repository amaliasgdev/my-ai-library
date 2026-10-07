package com.mibiblioteca.bookservice;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocumentationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void apiDocsShouldDescribeBookEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.info.title").value("Mi Biblioteca - Book Service API"))
            .andExpect(jsonPath("$.info.version").value("0.0.1"))
            .andExpect(jsonPath("$.paths['/api/books'].post.responses['201']").exists())
            .andExpect(jsonPath("$.paths['/api/books/{id}'].delete.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/books/{id}/reading-dates'].put").exists())
            .andExpect(jsonPath("$.paths['/api/books/search'].get.parameters[?(@.name == 'title')]").exists())
            .andExpect(jsonPath("$.components.schemas.ProblemDetail").exists())
            .andExpect(jsonPath("$.components.responses.BadRequest").exists())
            .andExpect(jsonPath("$.components.responses.NotFound").exists())
            .andExpect(jsonPath("$.components.responses.Conflict").exists())
            .andExpect(jsonPath("$.components.responses.BadRequest.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"))
            .andExpect(jsonPath("$.components.responses.NotFound.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"))
            .andExpect(jsonPath("$.components.responses.Conflict.content['application/problem+json'].schema.$ref").value("#/components/schemas/ProblemDetail"));
    }

    @Test
    void swaggerUiShouldBeAvailable() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/swagger-ui/index.html"));

        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }
}

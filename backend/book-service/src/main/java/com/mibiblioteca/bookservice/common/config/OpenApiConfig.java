package com.mibiblioteca.bookservice.common.config;

import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ProblemDetail;
import java.util.LinkedHashMap;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI bookServiceOpenApi() {
        Components components = new Components();
        components.schemas(new LinkedHashMap<>(ModelConverters.getInstance().readAll(ProblemDetail.class)));

        Schema<?> problemDetailSchema = new Schema<>().$ref("#/components/schemas/ProblemDetail");
        Content errorContent = new Content().addMediaType("application/problem+json", new MediaType().schema(problemDetailSchema));

        return new OpenAPI()
            .info(
                new Info()
                    .title("Mi Biblioteca - Book Service API")
                    .description("REST API for managing a personal library, including books, search, reading status, ratings, and reading dates. Authentication is not currently required.")
                    .version("0.0.1")
            )
            .components(
                components
                    .addResponses("BadRequest", new ApiResponse().description("Invalid request").content(errorContent))
                    .addResponses("NotFound", new ApiResponse().description("Book not found").content(errorContent))
                    .addResponses("Conflict", new ApiResponse().description("Request conflicts with the current book state").content(errorContent))
            );
    }
}

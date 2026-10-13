package com.mibiblioteca.bookservice.book.api;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.annotation.ElementType;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Parameters;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.enums.ParameterStyle;
import io.swagger.v3.oas.annotations.enums.Explode;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ArraySchema;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Parameters({
    @Parameter(name = "readingStatus", in = ParameterIn.QUERY, style = ParameterStyle.FORM, explode = Explode.TRUE, description = "Repeat for OR; at most four occurrences, no CSV", array = @ArraySchema(schema = @Schema(type = "string", allowableValues = {"TO_READ", "READING", "READ", "ABANDONED"}))),
    @Parameter(name = "ratingMin", in = ParameterIn.QUERY, schema = @Schema(type = "integer", minimum = "1", maximum = "5")),
    @Parameter(name = "yearFrom", in = ParameterIn.QUERY, schema = @Schema(type = "integer", minimum = "1", maximum = "2100")),
    @Parameter(name = "yearTo", in = ParameterIn.QUERY, schema = @Schema(type = "integer", minimum = "1", maximum = "2100")),
    @Parameter(name = "genre", in = ParameterIn.QUERY, description = "Exact case-insensitive array element", schema = @Schema(type = "string", maxLength = 50)),
    @Parameter(name = "language", in = ParameterIn.QUERY, description = "ISO 639-1 code", schema = @Schema(type = "string", minLength = 2, maxLength = 2)),
    @Parameter(name = "publisher", in = ParameterIn.QUERY, description = "Literal case-insensitive substring", schema = @Schema(type = "string", maxLength = 255)),
    @Parameter(name = "room", in = ParameterIn.QUERY, description = "Exact case-insensitive, accent-sensitive room; single nonblank occurrence, trimmed, no controls", schema = @Schema(type = "string", maxLength = 100)),
    @Parameter(name = "bookcase", in = ParameterIn.QUERY, description = "Exact case-insensitive bookcase; single nonblank occurrence, trimmed, no controls", schema = @Schema(type = "string", maxLength = 100)),
    @Parameter(name = "shelf", in = ParameterIn.QUERY, description = "Exact case-insensitive textual shelf; single nonblank occurrence, trimmed, no controls", schema = @Schema(type = "string", maxLength = 50))
})
public @interface CatalogFilterParameters {}

package com.mibiblioteca.bookservice.saga;

import static com.mibiblioteca.bookservice.saga.SagaDtos.BookSagaResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/books")
@Tag(name = "Sagas", description = "Literary saga management")
public class BookSagaController {

    private final SagaVolumeService service;

    public BookSagaController(SagaVolumeService service) {
        this.service = service;
    }

    @GetMapping("/{id}/sagas")
    @Operation(
        summary = "List the sagas a book belongs to",
        description = "Returns one entry per saga that contains the book, ordered by saga name "
            + "(case-insensitive) and saga id. Returns an empty array when the book exists but has "
            + "no sagas. BookResponse and the book search contract are unchanged."
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Book saga memberships, possibly empty"),
        @ApiResponse(responseCode = "404", ref = "NotFound")
    })
    public List<BookSagaResponse> find(@PathVariable Long id) {
        return service.findSagasForBook(id);
    }
}

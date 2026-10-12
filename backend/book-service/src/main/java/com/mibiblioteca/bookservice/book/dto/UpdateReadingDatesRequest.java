package com.mibiblioteca.bookservice.book.dto;

import java.time.LocalDate;

public record UpdateReadingDatesRequest(LocalDate startedOn, LocalDate finishedOn) {
}

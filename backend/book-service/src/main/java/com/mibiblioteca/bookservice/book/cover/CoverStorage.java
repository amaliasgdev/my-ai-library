package com.mibiblioteca.bookservice.book.cover;

public interface CoverStorage {
    String store(Long bookId, ValidatedCover image);
    ValidatedCover read(String filename);
    void delete(String filename);
}

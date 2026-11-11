package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.ProviderResult;

/** Provider receives only a rebuilt, correctly oriented PNG: no filename, metadata or persistence access. */
public interface BookPhotoRecognitionProvider {
    String id();
    boolean simulated();
    ProviderResult recognize(PhotoImage image) throws Exception;

    record PhotoImage(byte[] bytes, String mediaType, int width, int height) { }
}

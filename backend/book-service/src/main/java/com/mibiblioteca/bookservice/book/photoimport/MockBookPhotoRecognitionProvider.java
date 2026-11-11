package com.mibiblioteca.bookservice.book.photoimport;

import com.mibiblioteca.bookservice.book.photoimport.PhotoImportDtos.*;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("(dev | test) & !prod & !production")
@ConditionalOnProperty(prefix = "photo-import", name = "provider", havingValue = "mock")
public class MockBookPhotoRecognitionProvider implements BookPhotoRecognitionProvider {
    public String id() { return "mock"; }
    public boolean simulated() { return true; }

    public ProviderResult recognize(PhotoImage image) {
        return new ProviderResult(List.of(new Observation("1", "SIMULATED SAMPLE: DUNE / FRANK HERBERT",
            "Dune", "Frank Herbert", null, Legibility.CLEAR,
            List.of("Fixed demonstration; unrelated to the uploaded photograph"))), false,
            List.of("SIMULATED: no visual recognition was performed"));
    }
}

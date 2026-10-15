package com.mibiblioteca.bookservice.inventory;

import static org.assertj.core.api.Assertions.*;
import com.mibiblioteca.bookservice.location.Shelf;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class InventorySessionTest {
    @Test void domainHasOnlyExplicitTerminalTransitionsAndSeparateDates() {
        var now=Instant.parse("2026-10-15T12:00:00Z");
        var session=new InventorySession(new Shelf(),"notes",now);
        assertThat(session.getCreatedAt()).isEqualTo(session.getStartedAt()).isEqualTo(session.getUpdatedAt());
        session.updateNotes("other",now.plusSeconds(1));
        session.close(InventorySessionStatus.CANCELLED,now.plusSeconds(2));
        assertThat(session.getCancelledAt()).isEqualTo(session.getUpdatedAt()); assertThat(session.getCompletedAt()).isNull();
        assertThatThrownBy(() -> session.close(InventorySessionStatus.COMPLETED,now.plusSeconds(3))).isInstanceOf(InventorySessionException.class);
        assertThatThrownBy(() -> session.updateNotes("no",now.plusSeconds(3))).isInstanceOf(InventorySessionException.class);
        assertThat(session.getNotes()).isEqualTo("other");
    }
}

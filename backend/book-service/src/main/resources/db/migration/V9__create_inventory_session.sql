CREATE TABLE inventory_session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shelf_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    notes VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT fk_inventory_session_shelf FOREIGN KEY (shelf_id) REFERENCES shelf(id) ON DELETE RESTRICT,
    CONSTRAINT ck_inventory_session_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT ck_inventory_session_terminal CHECK (
        (status = 'IN_PROGRESS' AND completed_at IS NULL AND cancelled_at IS NULL) OR
        (status = 'COMPLETED' AND completed_at IS NOT NULL AND cancelled_at IS NULL) OR
        (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
    ),
    CONSTRAINT ck_inventory_session_dates CHECK (
        started_at >= created_at AND updated_at >= created_at AND
        (completed_at IS NULL OR completed_at >= started_at) AND
        (cancelled_at IS NULL OR cancelled_at >= started_at)
    )
);
CREATE INDEX ix_inventory_session_shelf_started ON inventory_session (shelf_id, started_at DESC, id DESC);
CREATE UNIQUE INDEX uq_inventory_session_active_shelf ON inventory_session (shelf_id) WHERE status = 'IN_PROGRESS';

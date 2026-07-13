-- Phase 8: mini-CRM, per TAPOWNER_BUILD.md §5.
CREATE TABLE IF NOT EXISTS saved_properties (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    parcel_id    BIGINT NOT NULL REFERENCES parcels(id),
    status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'contacted', 'follow_up', 'appointment', 'listed', 'dead')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, parcel_id)
);
CREATE INDEX IF NOT EXISTS saved_properties_user_id_idx ON saved_properties (user_id);
CREATE INDEX IF NOT EXISTS saved_properties_status_idx ON saved_properties (status);

CREATE TABLE IF NOT EXISTS notes (
    id                  BIGSERIAL PRIMARY KEY,
    saved_property_id   BIGINT NOT NULL REFERENCES saved_properties(id) ON DELETE CASCADE,
    body                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_saved_property_id_idx ON notes (saved_property_id);

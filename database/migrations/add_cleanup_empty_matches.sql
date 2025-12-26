-- ============================================================
-- Migration: Remove multiplayer matches with no participants
-- ============================================================
-- Adds a trigger on multiplayer_match_participants so that when
-- the last participant row for a match is deleted (for example,
-- via cascading user deletion), the parent match row is deleted.
-- ============================================================

CREATE OR REPLACE FUNCTION remove_empty_multiplayer_match()
RETURNS TRIGGER AS $$
BEGIN
    -- Only delete matches that currently have no participants.
    IF NOT EXISTS (
        SELECT 1
        FROM multiplayer_match_participants
        WHERE match_id = OLD.match_id
    ) THEN
        DELETE FROM multiplayer_matches WHERE id = OLD.match_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remove_empty_match ON multiplayer_match_participants;
CREATE TRIGGER trg_remove_empty_match
AFTER DELETE ON multiplayer_match_participants
FOR EACH ROW
EXECUTE FUNCTION remove_empty_multiplayer_match();


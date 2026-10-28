-- ADR-009 / I1: append-only tables. Corrections are new versions or new events, never edits.
CREATE FUNCTION skillab_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'skillab: % on append-only table %.% is forbidden', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.skill_versions', 'public.skill_events', 'public.decisions', 'public.evidence',
    'public.episodes', 'public.test_access_log', 'sealed.truth'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION skillab_forbid_mutation()', t);
    EXECUTE format(
      'CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION skillab_forbid_mutation()', t);
  END LOOP;
END;
$$;

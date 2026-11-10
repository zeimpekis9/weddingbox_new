CREATE FUNCTION wedding.event_for_slug(target_slug text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT id FROM wedding.events WHERE slug=target_slug $$;

CREATE FUNCTION wedding.event_profile(target uuid)
RETURNS TABLE (slug text, event_date date, primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT slug,date,primary_color FROM wedding.events WHERE id=target $$;

CREATE FUNCTION wedding.update_event_profile(
  session_hash text, target uuid, event_title text, event_slug text, event_date date, welcome text, color text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid;
BEGIN
  SELECT user_id INTO actor FROM wedding.admin_sessions WHERE token_hash=session_hash AND expires_at > now();
  IF NOT wedding.can_administer_event(actor,target,'manage') THEN RETURN false; END IF;
  UPDATE wedding.events SET title=event_title,slug=event_slug,date=event_date,welcome_message=welcome,primary_color=color
  WHERE id=target;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO wedding.admin_audit(event_id,user_id,operation) VALUES (target,actor,'event_profile');
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION wedding.event_for_slug(text),wedding.event_profile(uuid),
  wedding.update_event_profile(text,uuid,text,text,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wedding.event_for_slug(text),wedding.event_profile(uuid),
  wedding.update_event_profile(text,uuid,text,text,date,text,text) TO wedding_api;

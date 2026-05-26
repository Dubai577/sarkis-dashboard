CREATE OR REPLACE FUNCTION hash_pin_on_save()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.pin IS DISTINCT FROM OLD.pin) THEN
    NEW.pin_hash = crypt(NEW.pin, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_hash_pin ON contributors;

CREATE TRIGGER auto_hash_pin
  BEFORE INSERT OR UPDATE ON contributors
  FOR EACH ROW EXECUTE FUNCTION hash_pin_on_save();

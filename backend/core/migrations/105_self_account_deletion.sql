-- Additive, inactive until SELF_ACCOUNT_DELETION_ENABLED=true in the Core.
CREATE TABLE self_account_deletions (
 id uuid PRIMARY KEY, subject_type text NOT NULL CHECK(subject_type IN ('driver','passenger')),
 subject_id text NOT NULL, receipt_hash text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('processing','deleted')),
 cleanup jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(subject_type,subject_id)
);
CREATE FUNCTION reject_self_closed_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role text; subject text; data jsonb := to_jsonb(NEW); roles text[]; subjects text[]; idx integer;
BEGIN
 IF current_setting('ramo.account_deletion_worker',true)='true' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='rides' THEN
  IF TG_OP='UPDATE' AND NEW.state IN ('COMPLETED','CANCELLED_BY_PASSENGER','CANCELLED_BY_DRIVER','CANCELLED_BY_ADMIN','REFUNDED') THEN RETURN NEW; END IF;
  roles:=ARRAY['passenger','driver','driver']; subjects:=ARRAY[NEW.passenger_id,NEW.driver_id,NEW.reserved_driver_id];
 ELSIF TG_TABLE_NAME='payments' THEN
  SELECT ARRAY['passenger','driver'],ARRAY[r.passenger_id,r.driver_id] INTO roles,subjects FROM rides r WHERE r.id=NEW.ride_id;
 ELSIF TG_TABLE_NAME IN ('auth_sessions','auth_identities') THEN
  roles:=ARRAY[NEW.subject_type];subjects:=ARRAY[NEW.subject_id];
 ELSIF TG_TABLE_NAME IN ('driver_supply','driver_profiles','driver_documents','driver_vehicles','driver_payouts') THEN
  IF TG_TABLE_NAME='driver_supply' AND NOT (data->>'online')::boolean THEN RETURN NEW; END IF;
  roles:=ARRAY['driver'];subjects:=ARRAY[data->>'driver_id'];
 ELSE
  roles:=ARRAY['passenger'];subjects:=ARRAY[data->>'passenger_id'];
 END IF;
 FOR idx IN 1..coalesce(array_length(subjects,1),0) LOOP
  role:=roles[idx];subject:=subjects[idx];
  IF subject IS NULL THEN CONTINUE; END IF;
  PERFORM 1 FROM auth_identities WHERE subject_type=role AND subject_id=subject FOR KEY SHARE;
  IF EXISTS(SELECT 1 FROM self_account_deletions WHERE subject_type=role AND subject_id=subject) THEN
   RAISE EXCEPTION 'Conta em exclusão ou excluída.' USING ERRCODE='23503';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER self_closed_rides BEFORE INSERT OR UPDATE OF passenger_id,driver_id,reserved_driver_id,state ON rides FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_payments BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_topups BEFORE INSERT ON wallet_topups FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_payouts BEFORE INSERT ON driver_payouts FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_sessions BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_identity BEFORE INSERT OR UPDATE ON auth_identities FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_supply BEFORE INSERT OR UPDATE ON driver_supply FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_profile BEFORE INSERT OR UPDATE ON driver_profiles FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_documents BEFORE INSERT OR UPDATE ON driver_documents FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_vehicles BEFORE INSERT OR UPDATE ON driver_vehicles FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_places BEFORE INSERT OR UPDATE ON passenger_saved_places FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_cards BEFORE INSERT OR UPDATE ON passenger_saved_cards FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();
CREATE TRIGGER self_closed_customers BEFORE INSERT OR UPDATE ON passenger_payment_customers FOR EACH ROW EXECUTE FUNCTION reject_self_closed_account();

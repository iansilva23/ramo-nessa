-- Keep support and legal history addressable by the original subject after removing login.
ALTER TABLE public.driver_support_tickets
  DROP CONSTRAINT driver_support_tickets_passenger_fkey;
ALTER TABLE public.legal_document_acceptances
  DROP CONSTRAINT legal_document_acceptances_subject_type_subject_id_fkey;

CREATE FUNCTION public.require_identity_for_new_account_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  linked_role text;
  linked_id text;
BEGIN
  IF TG_TABLE_NAME = 'driver_support_tickets' THEN
    linked_role := 'passenger';
    linked_id := NEW.passenger_id;
  ELSE
    linked_role := NEW.subject_type;
    linked_id := NEW.subject_id;
  END IF;
  IF linked_id IS NOT NULL THEN
    PERFORM 1 FROM public.auth_identities
      WHERE subject_type = linked_role AND subject_id = linked_id
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta inexistente para este registro.' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_ticket_passenger_exists
  BEFORE INSERT OR UPDATE OF passenger_id ON public.driver_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.require_identity_for_new_account_record();

CREATE TRIGGER legal_acceptance_identity_exists
  BEFORE INSERT OR UPDATE OF subject_type, subject_id ON public.legal_document_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.require_identity_for_new_account_record();

CREATE FUNCTION public.prevent_closed_account_reuse() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  linked_role text;
  linked_id text;
BEGIN
  IF TG_TABLE_NAME = 'driver_supply' THEN
    IF NOT NEW.online THEN RETURN NEW; END IF;
    linked_role := 'driver';
    linked_id := NEW.driver_id;
  ELSE
    linked_role := NEW.subject_type;
    linked_id := NEW.subject_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action = 'account.deleted' AND target_type = linked_role AND target_id = linked_id
  ) THEN
    RAISE EXCEPTION 'Conta encerrada.' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER closed_identity_id_reuse
  BEFORE INSERT OR UPDATE OF subject_type, subject_id ON public.auth_identities
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_account_reuse();

CREATE TRIGGER closed_identity_session
  BEFORE INSERT OR UPDATE OF subject_type, subject_id ON public.auth_sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_account_reuse();

CREATE TRIGGER closed_driver_supply
  BEFORE INSERT OR UPDATE OF driver_id, online ON public.driver_supply
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_account_reuse();

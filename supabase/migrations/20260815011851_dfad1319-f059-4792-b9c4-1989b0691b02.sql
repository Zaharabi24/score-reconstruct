CREATE OR REPLACE FUNCTION private.prevent_employee_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.role INTO actor_role FROM public.employees e WHERE e.id = actor;

  IF actor_role = 'hr_admin' THEN
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.manager_id := OLD.manager_id;
  NEW.department_id := OLD.department_id;
  NEW.is_demo := OLD.is_demo;
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_employee_self_escalation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_prevent_self_escalation ON public.employees;
CREATE TRIGGER employees_prevent_self_escalation
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.prevent_employee_self_escalation();
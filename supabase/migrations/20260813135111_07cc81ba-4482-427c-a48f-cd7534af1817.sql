REVOKE ALL ON FUNCTION public.seed_demo_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_history() TO service_role;
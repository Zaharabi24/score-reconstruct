
REVOKE ALL ON FUNCTION public.seed_department_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data_base() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_data_base() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_department_demo() TO service_role;

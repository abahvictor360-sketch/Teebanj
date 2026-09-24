-- Event trigger is database-internal; clients never need to call it.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

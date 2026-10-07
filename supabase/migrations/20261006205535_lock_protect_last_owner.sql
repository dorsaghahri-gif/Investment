-- Trigger-only SECURITY DEFINER function must not be callable via the REST API.
revoke execute on function public.protect_last_owner() from public, anon, authenticated;

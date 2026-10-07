-- Trigger-only SECURITY DEFINER functions must not be callable via the REST API.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.snapshot_investment_profile() from public, anon, authenticated;

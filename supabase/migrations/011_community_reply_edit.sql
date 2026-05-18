alter table public.community_replies
  add column if not exists updated_at timestamptz;

notify pgrst, 'reload schema';

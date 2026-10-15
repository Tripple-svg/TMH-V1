insert into storage.buckets (id, name, public)
values ('playbook-private', 'playbook-private', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'playbook-private' and public = false) then
    raise exception 'playbook-private must be private before uploading the PDF';
  end if;
end $$;

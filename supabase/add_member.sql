-- Добавить человека в «Наш дом» после того, как он создан в Supabase → Authentication → Users.
-- Заменить почту и выполнить в Supabase → SQL Editor.
insert into household_members (household_id, user_id, role)
select h.id, u.id, 'owner'
from households h, auth.users u
where h.name = 'Наш дом' and u.email = 'ПОЧТА@example.com'
on conflict do nothing;

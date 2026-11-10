-- Кухня: схема базы, этап 1 (рецепты). Supabase / PostgreSQL.
-- Сток (этап 2) добавится отдельными таблицами в тот же "дом".

create extension if not exists pg_trgm;   -- нечёткий поиск ("оладьи" ~ "оладушки")
create extension if not exists unaccent;

-- ===== Дом и участники =====
create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  primary key (household_id, user_id)
);

create or replace function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = h and user_id = auth.uid());
$$;

-- ===== Рецепты =====
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  kind          text not null default 'recipe' check (kind in ('recipe','idea')),
  title         text not null,
  summary       text,                       -- 1–2 строки: что это и чем хорош
  yield_amount  numeric,                    -- 4 / 12 / 18
  yield_unit    text,                       -- 'порции' | 'шт' | 'форма Ø, см'
  time_min      int,                        -- общее время, если известно
  status        text not null default 'want' check (status in ('want','cooked')),
  rating        smallint check (rating between 1 and 5),
  notes         text,                       -- «соли меньше», «духовка 170»
  tags          text[] not null default '{}',
  methods       text[] not null default '{}', -- духовка | плита | без готовки | вафельница
  category      text,                       -- раздел меню: Завтраки, Супы, Салаты, Горячее, ...
  hidden        boolean not null default false, -- «не для меня»: не показывать в общем списке
  -- источник
  source_type   text check (source_type in
                  ('instagram','telegram','site','book','magazine','pdf','app','friend','own','other')),
  source_author text,                       -- @vicky_bakery, «Школа Новикова»
  source_url    text,
  source_ref    text,                       -- «стр. 47», «Сборник салатов, стр. 12»
  original_lang text not null default 'ru', -- ru | en | sr ...
  imported_from text,                       -- 'tg:203430' — откуда взяли при импорте
  share_token   text unique,                -- ссылка для мамы: /r/<token>
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Ингредиенты. section — блок («Для соуса», «Основа»).
-- name   — точный вид, как показываем людям: «сливки 33%», «творог сухой обезжиренный»
-- base   — категория для поиска и стока: «сливки», «творог»
-- raw    — формулировка из оригинала, сохраняется всегда
-- grams  — пересчёт в г/мл, если исходная мера неточная (стакан, ложки); approx = true
create table recipe_ingredients (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  position     int  not null,
  section      text,
  name         text not null,
  base         text not null,
  amount       numeric,
  amount_max   numeric,                   -- для «250–300 г»
  unit         text,                      -- г, мл, шт, ст. л., ч. л., щепотка, пучок, по вкусу
  grams        numeric,
  approx       boolean not null default false,
  optional     boolean not null default false,  -- «по желанию», «для подачи»
  alt_group    int,                       -- одинаковый номер = взаимозаменяемые («соус или кетчуп»)
  note         text,                      -- «тёплое», «у меня гхи»
  raw          text
);

create table recipe_steps (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  position   int  not null,
  section    text,
  text       text not null
);

-- Фото блюда, исходные скрины, PDF. Файлы лежат в Supabase Storage (bucket 'recipes').
create table recipe_media (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  position   int  not null default 0,
  kind       text not null check (kind in ('cover','photo','original','pdf')),
  path       text not null
);

-- «Готовила»: история, чтобы видеть когда и сколько раз
create table cook_log (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  cooked_on  date not null default current_date,
  by_user    uuid references auth.users(id),
  note       text
);

-- ===== Поиск =====
create index recipes_title_trgm on recipes using gin (title gin_trgm_ops);
create index ingr_base_idx      on recipe_ingredients (base);
create index ingr_name_trgm     on recipe_ingredients using gin (name gin_trgm_ops);
create index recipes_house_idx  on recipes (household_id);

-- ===== Доступ (RLS): видят и меняют только участники дома =====
alter table households          enable row level security;
alter table household_members   enable row level security;
alter table recipes             enable row level security;
alter table recipe_ingredients  enable row level security;
alter table recipe_steps        enable row level security;
alter table recipe_media        enable row level security;
alter table cook_log            enable row level security;

create policy h_read   on households        for select using (is_member(id));
create policy hm_read  on household_members for select using (is_member(household_id));
create policy r_all    on recipes           for all using (is_member(household_id))
                                             with check (is_member(household_id));
create policy ri_all   on recipe_ingredients for all using
  (is_member((select household_id from recipes where id = recipe_id)));
create policy rs_all   on recipe_steps      for all using
  (is_member((select household_id from recipes where id = recipe_id)));
create policy rm_all   on recipe_media      for all using
  (is_member((select household_id from recipes where id = recipe_id)));
create policy cl_all   on cook_log          for all using
  (is_member((select household_id from recipes where id = recipe_id)));

-- ===== Публичная ссылка на рецепт (для мамы, без входа) =====
create or replace function shared_recipe(token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'recipe', to_jsonb(r) - 'household_id' - 'created_by' - 'notes' - 'share_token',
    'ingredients', (select jsonb_agg(to_jsonb(i) order by i.position)
                    from recipe_ingredients i where i.recipe_id = r.id),
    'steps', (select jsonb_agg(to_jsonb(s) order by s.position)
              from recipe_steps s where s.recipe_id = r.id),
    'media', (select jsonb_agg(to_jsonb(m) order by m.position)
              from recipe_media m where m.recipe_id = r.id and m.kind in ('cover','photo')))
  from recipes r where r.share_token = token;
$$;
grant execute on function shared_recipe(text) to anon;

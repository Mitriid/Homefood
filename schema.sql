-- Выполни в Supabase: SQL Editor → New query → вставить всё → Run
-- Это полный набор таблиц для НОВОГО проекта Supabase. Если у тебя уже есть
-- рабочая база (ты запускал более ранний schema.sql), не запускай этот файл
-- заново — вместо этого один раз выполни upgrade.sql.

-- Комната = пользователь Supabase Auth. Каждая таблица хранит room_id, доступ открыт только владельцу комнаты.

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('г', 'шт')),    -- граммы; штуки только для яиц
  category text not null default 'Другое',
  kcal numeric not null default 0,                   -- ккал на 100 г (для «шт»: на 1 шт)
  price numeric,                                     -- цена за 1 кг (для «шт»: за 1 шт) в валюте комнаты
  staple boolean not null default false,             -- «всегда есть дома»: не попадает в список покупок
  unique (room_id, name)
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  meals text[] not null default '{}',                -- {'Завтрак','Обед/Ужин','Салаты','Десерт'}
  tags text[] not null default '{}',                 -- {'orange','green','blue'}
  difficulty int not null default 2 check (difficulty between 1 and 3),
  servings int not null default 1 check (servings >= 1),   -- на сколько порций указаны ингредиенты
  photo text,                                        -- фото в виде data:image/jpeg;base64,...
  time_min int,
  steps text default '',
  created_at timestamptz default now()
);

create table recipe_ingredients (
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,  -- удалили продукт: он пропадает и из блюд
  room_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null,                           -- в г (яйца в шт) на все порции рецепта
  primary key (recipe_id, ingredient_id)
);

-- Карточка пожеланий человека: items = [{"rid": "...", "slot": "0b"}]
-- Слот: день 0-6 + b/c/l/d (завтрак, завтрак 2, обед, ужин), s0-s2 (салаты), x0-x2 (десерты)
create table wishes (
  room_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person text not null,
  items jsonb not null default '[]',
  updated_at timestamptz default now(),
  primary key (room_id, person)
);

-- Имена людей в комнате (кнопки выбора в «Моём меню») со скидкой на приготовление и расходники
create table people (
  room_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  discount numeric not null default 0 check (discount in (0, 10, 20, 50, 100)),
  primary key (room_id, name)
);

-- Настройки комнаты
create table settings (
  room_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  currency text not null default 'AMD' check (currency in ('AMD', 'RUB', 'USD', 'GEL')),
  supplies numeric not null default 200,             -- расходники за одну порцию
  cook_k1 numeric not null default 0.7,              -- оплата приготовления для сложности ★
  cook_k2 numeric not null default 1,                -- оплата приготовления для сложности ★★
  cook_k3 numeric not null default 1.5               -- оплата приготовления для сложности ★★★
);

-- Журнал изменений: только для чтения из приложения, пишут его только серверные функции и триггеры ниже,
-- поэтому подделать запись через браузер нельзя.
create table journal (
  id bigserial primary key,
  room_id uuid not null,
  at timestamptz not null default now(),
  kind text not null,
  data jsonb not null default '{}',
  red boolean not null default false
);

-- Защита: каждая комната видит и меняет только свои строки
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table wishes enable row level security;
alter table people enable row level security;
alter table settings enable row level security;
alter table journal enable row level security;

create policy "room" on ingredients for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
create policy "room" on recipes for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
create policy "room" on recipe_ingredients for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
create policy "room" on wishes for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
create policy "room" on people for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
create policy "room" on settings for all to authenticated using (room_id = auth.uid()) with check (room_id = auth.uid());
-- У journal нет политики на insert/update/delete: обычный пользователь не может писать в неё напрямую.
-- Строки добавляют только функции ниже с правами SECURITY DEFINER (владелец функций — роль postgres, у неё есть BYPASSRLS).
create policy "room_read" on journal for select to authenticated using (room_id = auth.uid());

-- ===================== Журнал: триггеры-наблюдатели =====================
-- Эти функции запускаются автоматически при изменении данных и сами решают, что писать в журнал.
-- current_setting('app.suppress_log', true) = 'on' — временная заглушка, чтобы change_currency() не плодил
-- отдельную запись на каждый продукт при массовом пересчёте цен.

create or replace function jlog(p_room uuid, p_kind text, p_data jsonb, p_red boolean default false)
returns void language sql security definer as $$
  insert into journal (room_id, kind, data, red) values (p_room, p_kind, p_data, p_red);
$$;

create or replace function trg_ingredients() returns trigger language plpgsql security definer as $$
begin
  if current_setting('app.suppress_log', true) = 'on' then
    if tg_op = 'UPDATE' then return new; end if;
  end if;
  if tg_op = 'INSERT' then
    perform jlog(new.room_id, 'ing_add', jsonb_build_object('name', new.name), false);
  elsif tg_op = 'UPDATE' then
    if new.price is distinct from old.price then
      perform jlog(new.room_id, 'ing_price', jsonb_build_object('name', new.name, 'old', old.price, 'new', new.price), true);
    end if;
    if new.name is distinct from old.name then
      perform jlog(new.room_id, 'ing_name', jsonb_build_object('old', old.name, 'new', new.name), false);
    end if;
    if new.kcal is distinct from old.kcal then
      perform jlog(new.room_id, 'ing_kcal', jsonb_build_object('name', new.name, 'old', old.kcal, 'new', new.kcal), false);
    end if;
  elsif tg_op = 'DELETE' then
    perform jlog(old.room_id, 'ing_del', jsonb_build_object('name', old.name), false);
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists t_ingredients on ingredients;
create trigger t_ingredients after insert or update or delete on ingredients for each row execute function trg_ingredients();

create or replace function trg_recipes() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    perform jlog(new.room_id, 'rec_add', jsonb_build_object('title', new.title), true);
  elsif tg_op = 'UPDATE' then
    perform jlog(new.room_id, 'rec_edit', jsonb_build_object('title', new.title, 'old', old.title), true);
  elsif tg_op = 'DELETE' then
    perform jlog(old.room_id, 'rec_del', jsonb_build_object('title', old.title), true);
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists t_recipes on recipes;
create trigger t_recipes after insert or update or delete on recipes for each row execute function trg_recipes();

create or replace function trg_people() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    perform jlog(new.room_id, 'person_add', jsonb_build_object('name', new.name), false);
  elsif tg_op = 'UPDATE' then
    if new.discount is distinct from old.discount then
      perform jlog(new.room_id, 'person_disc', jsonb_build_object('name', new.name, 'old', old.discount, 'new', new.discount), true);
    end if;
  elsif tg_op = 'DELETE' then
    perform jlog(old.room_id, 'person_del', jsonb_build_object('name', old.name), false);
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists t_people on people;
create trigger t_people after insert or update or delete on people for each row execute function trg_people();

create or replace function trg_settings() returns trigger language plpgsql security definer as $$
begin
  if current_setting('app.suppress_log', true) = 'on' then return new; end if;
  if new.currency is distinct from old.currency then
    perform jlog(new.room_id, 'set_cur', jsonb_build_object('old', old.currency, 'new', new.currency), true);
  end if;
  if new.supplies is distinct from old.supplies then
    perform jlog(new.room_id, 'set_sup', jsonb_build_object('old', old.supplies, 'new', new.supplies), true);
  end if;
  if new.cook_k1 is distinct from old.cook_k1 then
    perform jlog(new.room_id, 'set_cook', jsonb_build_object('star', 1, 'old', old.cook_k1, 'new', new.cook_k1), true);
  end if;
  if new.cook_k2 is distinct from old.cook_k2 then
    perform jlog(new.room_id, 'set_cook', jsonb_build_object('star', 2, 'old', old.cook_k2, 'new', new.cook_k2), true);
  end if;
  if new.cook_k3 is distinct from old.cook_k3 then
    perform jlog(new.room_id, 'set_cook', jsonb_build_object('star', 3, 'old', old.cook_k3, 'new', new.cook_k3), true);
  end if;
  return new;
end; $$;
drop trigger if exists t_settings on settings;
create trigger t_settings after update on settings for each row execute function trg_settings();

-- Смена валюты с пересчётом цен по курсу. SECURITY DEFINER + suppress_log: одна запись в журнале вместо сотен.
create or replace function change_currency(new_cur text, rate numeric default 1)
returns void language plpgsql security definer as $$
declare r_id uuid := auth.uid(); old_cur text; f numeric;
begin
  select currency into old_cur from settings where room_id = r_id;
  perform set_config('app.suppress_log', 'on', true);
  if rate > 0 and rate <> 1 then
    f := case when new_cur in ('USD', 'GEL') then 100 else 1 end;
    update ingredients set price = round(price * rate * f) / f where room_id = r_id and price is not null;
    update settings set supplies = round(supplies * rate * f) / f, currency = new_cur where room_id = r_id;
  else
    update settings set currency = new_cur where room_id = r_id;
  end if;
  perform set_config('app.suppress_log', 'off', true);
  perform jlog(r_id, 'cur_change', jsonb_build_object('old', old_cur, 'new', new_cur, 'rate', rate), true);
end; $$;

-- «Начать новую неделю»: снимок недели (кто что выбрал, по каким ценам) уходит в журнал, карточки очищаются.
-- Выполняется на сервере, поэтому из браузера эту запись подделать нельзя.
create or replace function new_week()
returns void language plpgsql security definer as $$
declare r_id uuid := auth.uid(); snap jsonb;
begin
  select jsonb_build_object(
    'wishes', coalesce((select jsonb_agg(jsonb_build_object('person', person, 'items', items)) from wishes where room_id = r_id), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'discount', discount)) from people where room_id = r_id), '[]'),
    'settings', (select jsonb_build_object('currency', currency, 'supplies', supplies, 'cook_k1', cook_k1, 'cook_k2', cook_k2, 'cook_k3', cook_k3) from settings where room_id = r_id),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rec.id, 'title', rec.title, 'difficulty', rec.difficulty, 'servings', rec.servings,
        'items', (select jsonb_agg(jsonb_build_object('n', i.name, 'u', i.unit, 'p', i.price, 's', i.staple, 'a', ri.amount))
                  from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id where ri.recipe_id = rec.id)
      ))
      from recipes rec
      where rec.room_id = r_id and rec.id in (
        select (item->>'rid')::uuid from wishes w, jsonb_array_elements(w.items) item where w.room_id = r_id
      )
    ), '[]')
  ) into snap;
  perform jlog(r_id, 'week', snap, false);
  delete from wishes where room_id = r_id;
end; $$;

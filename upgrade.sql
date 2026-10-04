-- Выполни в Supabase: SQL Editor → New query → вставить всё → Run
-- Это ДОПОЛНЕНИЕ к уже работающей базе (ты уже выполнял schema.sql раньше).
-- Добавляет: скидку для людей, коэффициент оплаты приготовления, журнал изменений
-- и защиту от удаления продукта, который используется в блюдах.
-- Выполнять можно повторно — ничего не сломает и не продублирует.
-- Если ты уже выполнял более раннюю версию этого файла (с общим коэффициентом cook_mult),
-- повторный запуск сам заменит его на три отдельных коэффициента cook_k1/cook_k2/cook_k3.

alter table recipe_ingredients drop constraint if exists recipe_ingredients_ingredient_id_fkey,
  add constraint recipe_ingredients_ingredient_id_fkey
  foreign key (ingredient_id) references ingredients(id) on delete cascade;

alter table people add column if not exists discount numeric not null default 0 check (discount in (0, 10, 20, 50, 100));
alter table settings drop column if exists cook_mult;
alter table settings add column if not exists cook_k1 numeric not null default 0.7;  -- оплата приготовления для сложности ★
alter table settings add column if not exists cook_k2 numeric not null default 1;    -- оплата приготовления для сложности ★★
alter table settings add column if not exists cook_k3 numeric not null default 1.5;  -- оплата приготовления для сложности ★★★

create table if not exists journal (
  id bigserial primary key,
  room_id uuid not null,
  at timestamptz not null default now(),
  kind text not null,
  data jsonb not null default '{}',
  red boolean not null default false
);
alter table journal enable row level security;
drop policy if exists "room_read" on journal;
create policy "room_read" on journal for select to authenticated using (room_id = auth.uid());

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

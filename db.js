import { SEED_INGREDIENTS, SEED_RECIPES, SEED_VERSION } from './seed.js';

// Вставь ключи из Supabase (Project Settings → API Keys). Пока пусто — всё хранится только в этом браузере.
const SUPABASE_URL = 'https://pvrmbgdlzprwbaiwbhzt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cm1iZ2RsenByd2JhaXdiaHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjQwMDcsImV4cCI6MjEwNjcwMDAwN30.zzYYBHQHfRsbVXt72JC6cEz7E6PK4Hihu_GymK66BZ0';

const sb = SUPABASE_URL ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const mode = sb ? 'supabase' : 'local';
let ROOM = null; // id текущей комнаты
let DEMO = false, MEM = null; // демо: данные только в памяти, ничего не сохраняется
const useSb = () => sb && !DEMO;
export const isRemote = () => !!useSb();

const uid = () => crypto.randomUUID();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .map((x) => x.toString(16).padStart(2, '0')).join('');

/* ---------- Локальный режим: комнаты и данные в браузере ---------- */
const rooms = () => JSON.parse(localStorage.getItem('menu_rooms_v1') || '[]');
const KEY = () => `menu_db_v6_${ROOM}`;
const load = () => (DEMO ? MEM : JSON.parse(localStorage.getItem(KEY())));
const save = (d) => { if (DEMO) MEM = d; else localStorage.setItem(KEY(), JSON.stringify(d)); };

// Журнал в локальном режиме (с Supabase журнал пишет сервер, см. journal.sql). Хранятся последние 1000 записей.
const JMAX = 1000;
function jlog(d, kind, data, red = false) {
  d.journal ||= [];
  d.journal.unshift({ id: ((d.journal[0] && d.journal[0].id) || 0) + 1, at: new Date().toISOString(), kind, data, red });
  if (d.journal.length > JMAX) d.journal.length = JMAX;
}
const people = (d) => (d.people || []).map((p) => (typeof p === 'string' ? { name: p, discount: 0 } : p));
const DEF_SET = { currency: 'AMD', supplies: 200, cook_k1: 0.7, cook_k2: 1, cook_k3: 1.5 };

/* ---------- Вход в комнату ---------- */
// В Supabase комната = пользователь. Логин превращаем в служебный адрес, чтобы можно было писать любой логин.
const emailOf = async (login) => `r${(await sha(`menu-room:${login.trim().toLowerCase()}`)).slice(0, 40)}@gmail.com`;

export async function restore() {
  if (sb) {
    const { data } = await sb.auth.getSession();
    const u = data.session && data.session.user;
    if (!u) return null;
    ROOM = u.id;
    return { id: u.id, login: (u.user_metadata && u.user_metadata.login) || 'комната' };
  }
  const r = rooms().find((x) => x.id === localStorage.getItem('menu_session_v1'));
  if (!r) return null;
  ROOM = r.id;
  return { id: r.id, login: r.login };
}

export async function signUp(login, pass) {
  login = login.trim();
  if (sb) {
    const { data, error } = await sb.auth.signUp({ email: await emailOf(login), password: pass, options: { data: { login } } });
    if (error) throw error;
    if (!data.session) throw new Error('CONFIRM_EMAIL'); // в Supabase включено подтверждение почты
    ROOM = data.user.id;
    return { id: ROOM, login };
  }
  const list = rooms();
  if (list.some((r) => r.login.toLowerCase() === login.toLowerCase())) throw new Error('User already registered');
  const salt = uid();
  const room = { id: uid(), login, salt, hash: await sha(salt + pass) };
  localStorage.setItem('menu_rooms_v1', JSON.stringify([...list, room]));
  localStorage.setItem('menu_session_v1', room.id);
  ROOM = room.id;
  return { id: room.id, login };
}

export async function signIn(login, pass) {
  login = login.trim();
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({ email: await emailOf(login), password: pass });
    if (error) throw error;
    ROOM = data.user.id;
    return { id: ROOM, login: (data.user.user_metadata && data.user.user_metadata.login) || login };
  }
  const room = rooms().find((r) => r.login.toLowerCase() === login.toLowerCase());
  if (!room || room.hash !== await sha(room.salt + pass)) throw new Error('Invalid login credentials');
  localStorage.setItem('menu_session_v1', room.id);
  ROOM = room.id;
  return { id: room.id, login: room.login };
}

// «Просто посмотреть»: вход без аккаунта, данные живут только до закрытия страницы
export function enterDemo() {
  DEMO = true; MEM = null; ROOM = 'demo';
  return { id: 'demo', login: 'Демо', demo: true };
}

export async function signOut() {
  if (!DEMO) { if (sb) await sb.auth.signOut(); else localStorage.removeItem('menu_session_v1'); }
  DEMO = false; MEM = null; ROOM = null;
}

/* ---------- Первый вход в комнату: стартовые продукты и блюда ---------- */
const ingRow = ([name, unit, category, kcal, price, staple]) => ({ name, unit, category, kcal, price, staple: !!staple });

async function seedRoom() {
  if (useSb()) {
    await sb.from('settings').upsert({ room_id: ROOM }, { onConflict: 'room_id', ignoreDuplicates: true });
    const { count } = await sb.from('recipes').select('*', { count: 'exact', head: true });
    if (count) return;
    const { data: ings, error } = await sb.from('ingredients')
      .upsert(SEED_INGREDIENTS.map((a) => ({ ...ingRow(a), room_id: ROOM })), { onConflict: 'room_id,name' }).select();
    if (error) throw error;
    const id = Object.fromEntries(ings.map((i) => [i.name, i.id]));
    for (const r of SEED_RECIPES) {
      const { data: rec, error: e2 } = await sb.from('recipes').insert({
        title: r.title, meals: r.meals, tags: r.tags || [], difficulty: r.difficulty || 2, servings: 1, steps: r.steps,
      }).select().single();
      if (e2) throw e2;
      await sb.from('recipe_ingredients').insert(r.ing.map(([n, amount]) => ({ recipe_id: rec.id, ingredient_id: id[n], amount })));
    }
    return;
  }
  if (load()) return;
  const ingredients = SEED_INGREDIENTS.map((a) => ({ id: uid(), ...ingRow(a) }));
  const id = Object.fromEntries(ingredients.map((i) => [i.name, i.id]));
  const recipes = SEED_RECIPES.map((r) => ({
    id: uid(), title: r.title, meals: r.meals, tags: r.tags || [], difficulty: r.difficulty || 2, servings: 1, steps: r.steps,
    items: r.ing.map(([n, amount]) => ({ ingredient_id: id[n], amount })),
  }));
  save({ ingredients, recipes, wishes: [], people: [], settings: { ...DEF_SET }, journal: [] });
}

// Новые стартовые продукты (после обновления сайта) добавляются в комнату один раз; удалённые вручную не возвращаются
async function topUp() {
  if (DEMO) return;
  const key = `menu_seedv_${ROOM}`;
  if (+(localStorage.getItem(key) || 0) >= SEED_VERSION) return;
  const have = new Set((await getIngredients()).map((i) => i.name.toLowerCase()));
  const rows = SEED_INGREDIENTS.filter((a) => !have.has(a[0].toLowerCase())).map(ingRow);
  if (rows.length) {
    if (useSb()) {
      const { error } = await sb.from('ingredients').insert(rows.map((r) => ({ ...r, room_id: ROOM })));
      if (error) throw error;
    } else {
      const d = load();
      rows.forEach((r) => d.ingredients.push({ id: uid(), ...r }));
      if (rows.length > 5) jlog(d, 'ing_add_many', { n: rows.length });
      save(d);
    }
  }
  localStorage.setItem(key, String(SEED_VERSION));
}

export async function init() { await seedRoom(); await topUp(); }

// Вернуть цены и калории стартовых продуктов к значениям по умолчанию (свои продукты не трогаем)
export async function resetToSeed() {
  const have = new Map((await getIngredients()).map((i) => [i.name.toLowerCase(), i]));
  const rows = SEED_INGREDIENTS.filter((a) => have.has(a[0].toLowerCase()));
  if (useSb()) {
    const { error } = await sb.from('ingredients').upsert(
      rows.map((a) => ({ ...ingRow(a), room_id: ROOM, name: have.get(a[0].toLowerCase()).name })), { onConflict: 'room_id,name' });
    if (error) throw error;
    return;
  }
  const d = load();
  rows.forEach((a) => {
    const ing = d.ingredients.find((i) => i.id === have.get(a[0].toLowerCase()).id);
    if (ing.price !== a[4]) jlog(d, 'ing_price', { name: ing.name, old: ing.price, new: a[4] }, true);
    if (ing.kcal !== a[3]) jlog(d, 'ing_kcal', { name: ing.name, old: ing.kcal, new: a[3] });
    Object.assign(ing, { price: a[4], kcal: a[3] });
  });
  save(d);
}

/* ---------- Продукты и рецепты ---------- */
export async function getIngredients() {
  if (useSb()) return (await sb.from('ingredients').select('*').order('name')).data;
  return load().ingredients;
}

// Фото НЕ запрашиваем здесь — список блюд должен грузиться быстро, даже если фото много.
// Фото подтягивается отдельно, только когда реально нужно показать конкретное блюдо (см. getPhoto).
export async function getRecipes() {
  if (useSb()) {
    const { data } = await sb.from('recipes')
      .select('id, title, meals, tags, difficulty, servings, steps, items:recipe_ingredients(ingredient_id, amount)')
      .order('title');
    return data;
  }
  return load().recipes;
}

export async function getPhoto(id) {
  if (useSb()) {
    const { data } = await sb.from('recipes').select('photo').eq('id', id).maybeSingle();
    return data ? data.photo || '' : '';
  }
  const r = load().recipes.find((x) => x.id === id);
  return r ? r.photo || '' : '';
}

// Фото хранится в Supabase Storage (бакет photos), ссылка просто текст в recipes.photo.
// В локальном/демо-режиме облака нет — фото остаётся как есть (data:... строка), ничего не грузим.
export async function uploadPhoto(blob) {
  if (!useSb()) return null;
  const path = `${ROOM}/${uid()}.jpg`;
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

export async function removeStoredPhoto(url) {
  if (!useSb() || !url) return;
  const m = url.match(/\/storage\/v1\/object\/public\/photos\/(.+)$/);
  if (!m) return;
  try { await sb.storage.from('photos').remove([m[1]]); } catch (e) { /* не страшно, просто останется неиспользуемый файл */ }
}

export async function addIngredient({ name, unit, category = 'Другое', kcal = 0, price = null, staple = false }) {
  if (useSb()) return (await sb.from('ingredients').insert({ name, unit, category, kcal, price, staple }).select().single()).data;
  const d = load();
  const ing = { id: uid(), name, unit, category, kcal, price, staple };
  d.ingredients.push(ing);
  jlog(d, 'ing_add', { n: 1, names: [name] });
  save(d);
  return ing;
}

export async function updateIngredient(id, patch) {
  if (useSb()) { const { error } = await sb.from('ingredients').update(patch).eq('id', id); if (error) throw error; return; }
  const d = load();
  const ing = d.ingredients.find((i) => i.id === id);
  if ('price' in patch && patch.price !== ing.price) jlog(d, 'ing_price', { name: ing.name, old: ing.price, new: patch.price }, true);
  if ('name' in patch && patch.name !== ing.name) jlog(d, 'ing_name', { old: ing.name, new: patch.name });
  if ('kcal' in patch && patch.kcal !== ing.kcal) jlog(d, 'ing_kcal', { name: ing.name, old: ing.kcal, new: patch.kcal });
  Object.assign(ing, patch);
  save(d);
}

export async function deleteIngredient(id) {
  if (useSb()) { const { error } = await sb.from('ingredients').delete().eq('id', id); if (error) throw error; return; } // из блюд убирается каскадом
  const d = load();
  const ing = d.ingredients.find((i) => i.id === id);
  d.ingredients = d.ingredients.filter((i) => i.id !== id);
  d.recipes.forEach((r) => { r.items = r.items.filter((it) => it.ingredient_id !== id); });
  if (ing) jlog(d, 'ing_del', { name: ing.name });
  save(d);
}

export async function addRecipe(r) {
  if (useSb()) {
    const { items, ...rest } = r;
    const { data: rec, error } = await sb.from('recipes').insert(rest).select().single();
    if (error) throw error;
    await sb.from('recipe_ingredients').insert(items.map((i) => ({ ...i, recipe_id: rec.id })));
    return rec;
  }
  const d = load();
  d.recipes.push({ id: uid(), ...r });
  jlog(d, 'rec_add', { title: r.title }, true);
  save(d);
}

export async function updateRecipe(id, r) {
  if (useSb()) {
    const { items, ...rest } = r;
    const { error } = await sb.from('recipes').update(rest).eq('id', id);
    if (error) throw error;
    await sb.from('recipe_ingredients').delete().eq('recipe_id', id);
    await sb.from('recipe_ingredients').insert(items.map((i) => ({ ...i, recipe_id: id })));
    return;
  }
  const d = load();
  const i = d.recipes.findIndex((x) => x.id === id);
  jlog(d, 'rec_edit', { title: r.title, old: d.recipes[i].title }, true);
  d.recipes[i] = { id, ...r };
  save(d);
}

export async function deleteRecipe(id) {
  if (useSb()) { await sb.from('recipes').delete().eq('id', id); return; }
  const d = load();
  const rec = d.recipes.find((x) => x.id === id);
  d.recipes = d.recipes.filter((x) => x.id !== id);
  if (rec) jlog(d, 'rec_del', { title: rec.title }, true);
  save(d);
}

/* ---------- Имена людей в комнате и скидки ---------- */
export async function getPeople() {
  if (useSb()) return ((await sb.from('people').select('name, discount').order('name')).data || []).map((p) => ({ name: p.name, discount: p.discount || 0 }));
  return people(load());
}

export async function addPerson(name) {
  if (useSb()) { await sb.from('people').upsert({ room_id: ROOM, name }, { onConflict: 'room_id,name', ignoreDuplicates: true }); return; }
  const d = load();
  const list = people(d);
  if (!list.some((p) => p.name === name)) { list.push({ name, discount: 0 }); jlog(d, 'person_add', { name }); }
  d.people = list;
  save(d);
}

export async function deletePerson(name) {
  if (useSb()) { await sb.from('people').delete().eq('name', name); return; }
  const d = load();
  d.people = people(d).filter((p) => p.name !== name);
  jlog(d, 'person_del', { name });
  save(d);
}

// Скидка на приготовление и расходники: 0, 10, 20, 50 или 100 процентов
export async function setDiscount(name, discount) {
  if (useSb()) { const { error } = await sb.from('people').update({ discount }).eq('name', name); if (error) throw error; return; }
  const d = load();
  const list = people(d);
  const p = list.find((x) => x.name === name);
  if (p && p.discount !== discount) jlog(d, 'person_disc', { name, old: p.discount, new: discount }, true);
  if (p) p.discount = discount;
  d.people = list;
  save(d);
}

/* ---------- Настройки комнаты: валюта, расходники, коэффициент приготовления ---------- */
export async function getSettings() {
  if (useSb()) {
    const { data } = await sb.from('settings').select('*').maybeSingle();
    return {
      currency: (data && data.currency) || 'AMD',
      supplies: data ? +data.supplies : 200,
      cook_k1: data && data.cook_k1 != null ? +data.cook_k1 : 0.7,
      cook_k2: data && data.cook_k2 != null ? +data.cook_k2 : 1,
      cook_k3: data && data.cook_k3 != null ? +data.cook_k3 : 1.5,
    };
  }
  return { ...DEF_SET, ...(load().settings || {}) };
}

export async function saveSettings(s) {
  if (useSb()) {
    const { error } = await sb.from('settings').upsert(
      { room_id: ROOM, currency: s.currency, supplies: s.supplies, cook_k1: s.cook_k1, cook_k2: s.cook_k2, cook_k3: s.cook_k3 },
      { onConflict: 'room_id' });
    if (error) throw error;
    return;
  }
  const d = load();
  const old = { ...DEF_SET, ...(d.settings || {}) };
  if (s.currency !== old.currency) jlog(d, 'set_cur', { old: old.currency, new: s.currency }, true);
  if (s.supplies !== old.supplies) jlog(d, 'set_sup', { old: old.supplies, new: s.supplies }, true);
  [1, 2, 3].forEach((star) => {
    const key = `cook_k${star}`;
    if (s[key] !== old[key]) jlog(d, 'set_cook', { star, old: old[key], new: s[key] }, true);
  });
  d.settings = { ...s };
  save(d);
}

// Смена валюты с пересчётом цен по курсу (rate = 1: только символ). С Supabase считает и пишет в журнал сервер.
export async function changeCurrency(newCur, rate) {
  if (useSb()) {
    const { error } = await sb.rpc('change_currency', { new_cur: newCur, rate });
    if (!error) return;
    if (!/change_currency|schema cache|PGRST202/i.test(`${error.code} ${error.message}`)) throw error;
    // сервер без journal.sql: считаем на клиенте
    const s = await getSettings();
    const f = 10 ** (['USD', 'GEL'].includes(newCur) ? 2 : 0);
    if (rate > 0 && rate !== 1) {
      for (const i of await getIngredients()) if (i.price != null) await updateIngredient(i.id, { price: Math.round(i.price * rate * f) / f });
      s.supplies = Math.round(s.supplies * rate * f) / f;
    }
    await saveSettings({ ...s, currency: newCur });
    return;
  }
  const d = load();
  const old = { ...DEF_SET, ...(d.settings || {}) };
  const f = 10 ** (['USD', 'GEL'].includes(newCur) ? 2 : 0);
  if (rate > 0 && rate !== 1) {
    d.ingredients.forEach((i) => { if (i.price != null) i.price = Math.round(i.price * rate * f) / f; });
    old.supplies = Math.round(old.supplies * rate * f) / f;
  }
  jlog(d, 'cur_change', { old: old.currency, new: newCur, rate: rate || 1 }, true);
  old.currency = newCur;
  d.settings = old;
  save(d);
}

/* ---------- Карточки пожеланий (меню на неделю) ---------- */
// wish = { person: 'Аня', items: [{ rid: 'id рецепта', slot: '0b' | 's1' | 'x2' }] }
export async function getWishes() {
  if (useSb()) {
    const { data } = await sb.from('wishes').select('*').order('person');
    return (data || []).map((w) => ({ person: w.person, items: w.items }));
  }
  return load().wishes || [];
}

export async function saveWish(person, items) {
  if (useSb()) {
    const { error } = await sb.from('wishes').upsert({ room_id: ROOM, person, items, updated_at: new Date().toISOString() }, { onConflict: 'room_id,person' });
    if (error) throw error;
    return;
  }
  const d = load();
  const i = d.wishes.findIndex((w) => w.person === person);
  if (i >= 0) d.wishes[i] = { person, items }; else d.wishes.push({ person, items });
  save(d);
}

export async function deleteWish(person) {
  if (useSb()) { await sb.from('wishes').delete().eq('person', person); return; }
  const d = load();
  d.wishes = d.wishes.filter((w) => w.person !== person);
  save(d);
}

async function clearWishes() {
  if (useSb()) { await sb.from('wishes').delete().neq('person', ''); return; }
  const d = load();
  d.wishes = [];
  save(d);
}

// «Начать новую неделю»: снимок недели (карточки, блюда, цены, настройки) уходит в журнал, карточки очищаются.
// С Supabase снимок делает сервер (function new_week), поэтому подделать его из браузера нельзя.
export async function newWeek() {
  if (useSb()) {
    const { error } = await sb.rpc('new_week');
    if (!error) return { archived: true };
    if (!/new_week|schema cache|PGRST202/i.test(`${error.code} ${error.message}`)) throw error;
    await clearWishes();
    return { archived: false }; // сервер без journal.sql
  }
  const d = load();
  const used = new Set((d.wishes || []).flatMap((w) => w.items.map((it) => it.rid)));
  const ingById = Object.fromEntries(d.ingredients.map((i) => [i.id, i]));
  jlog(d, 'week', {
    wishes: d.wishes || [],
    recipes: d.recipes.filter((r) => used.has(r.id)).map((r) => ({
      id: r.id, title: r.title, difficulty: r.difficulty, servings: r.servings || 1,
      items: r.items.filter((it) => ingById[it.ingredient_id]).map((it) => {
        const i = ingById[it.ingredient_id];
        return { n: i.name, u: i.unit, p: i.price, s: i.staple, a: it.amount };
      }),
    })),
    people: people(d),
    settings: { ...DEF_SET, ...(d.settings || {}) },
  });
  d.wishes = [];
  save(d);
  return { archived: true };
}

/* ---------- Журнал изменений (только чтение) ---------- */
// null — журнал недоступен (на сервере не выполнен journal.sql)
export async function getJournal() {
  if (useSb()) {
    const { data, error } = await sb.from('journal').select('id, at, kind, data, red').order('id', { ascending: false }).limit(JMAX);
    return error ? null : data;
  }
  return load().journal || [];
}

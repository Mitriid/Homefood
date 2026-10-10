import * as db from './db.js';
import { TAGS, SEED_INGREDIENTS, SEED_RECIPES } from './seed.js';
import { ING_EN, RECIPES_EN } from './seed_en.js';

const MAX = 34; // 7 дней × (2 завтрака + обед + ужин) + 3 салата + 3 десерта
const MEALS = ['Завтрак', 'Обед/Ужин', 'Салаты', 'Десерт'];
const MEALS_EN = ['Breakfast', 'Lunch/Dinner', 'Salads', 'Dessert'];
const DAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SD_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const SD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KINDS = [['b', 'Завтрак'], ['c', 'Завтрак 2'], ['l', 'Обед'], ['d', 'Ужин']];
const KIND_EN = { b: 'Breakfast', c: 'Breakfast 2', l: 'Lunch', d: 'Dinner' };
const NEED = { b: 'Завтрак', c: 'Завтрак', l: 'Обед/Ужин', d: 'Обед/Ужин', s: 'Салаты', x: 'Десерт' }; // раздел блюда для слота
const CATS = ['Мясо и птица', 'Рыба и морепродукты', 'Овощи', 'Зелень', 'Фрукты', 'Молочное и яйца', 'Крупы и макароны', 'Бобовые', 'Хлеб и выпечка',
  'Орехи и сухофрукты', 'Специи и соусы', 'Консервы', 'Сладости', 'Напитки', 'Бакалея', 'Другое'];
const CATS_EN = ['Meat & poultry', 'Fish & seafood', 'Vegetables', 'Herbs', 'Fruits', 'Dairy & eggs', 'Grains & pasta', 'Legumes', 'Bread & baked goods',
  'Nuts & dried fruits', 'Spices & sauces', 'Canned goods', 'Sweets', 'Drinks', 'Pantry', 'Other'];
const PAGES = [['recipes', 'Блюда', 'Dishes'], ['my', 'Рацион', 'My menu'], ['week', 'Меню недели', 'Weekly menu'], ['shop', 'Покупки', 'Shopping']];
const CUR = { AMD: ['֏', 0, 'Драм', 'Dram'], RUB: ['₽', 0, 'Рубль', 'Ruble'], USD: ['$', 2, 'Доллар', 'Dollar'], GEL: ['₾', 2, 'Лари', 'Lari'] };
const DISCOUNTS = [0, 10, 20, 50, 100];
// Слот = '0b' (день 0-6 + b/c/l/d), 's0'..'s2' (салаты), 'x0'..'x2' (десерты)
const kindOf = (s) => (/\d/.test(s[0]) ? s[1] : s[0]);
const ALL_SLOTS = [...DAYS_RU.flatMap((_, d) => KINDS.map(([k]) => `${d}${k}`)), 's0', 's1', 's2', 'x0', 'x1', 'x2'];

// Англоязычные названия стартовых продуктов и блюд (по тому же порядку, что в seed.js). Свои продукты и блюда не переводятся.
const ING_NAME_EN = Object.fromEntries(SEED_INGREDIENTS.map((a, i) => [a[0], ING_EN[i]]));
const REC_EN = Object.fromEntries(SEED_RECIPES.map((r, i) => [r.title, RECIPES_EN[i]]));
const TAG_NAME_EN = { orange: 'Orange', green: 'Green', blue: 'Blue' };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = {
  room: null, page: 'recipes', ings: [], recipes: [], wishes: [], people: [], settings: { currency: 'AMD', supplies: 200, cook_k1: 0.7, cook_k2: 1, cook_k3: 1.5 },
  editId: null, baseFrom: 'recipes', authMode: 'in', authLogin: '', journal: null,
  lang: localStorage.getItem('menu_lang') || 'ru',
  meal: 'Завтрак', q: '', tags: new Set(), pick: new Set(), openCats: new Set(), showPick: false,
  name: '', my: [], done: new Set(), priceOv: {}, formPhoto: '', // priceOv: временные правки цен в смете
};

// L(ru, en) — короткая обёртка для перевода статичного текста под текущий язык
const L = (ru, en) => (S.lang === 'en' ? en : ru);
const DAYS = () => (S.lang === 'en' ? DAYS_EN : DAYS_RU);
const SD = () => (S.lang === 'en' ? SD_EN : SD_RU);
const mealLabel = (m) => (S.lang === 'en' ? MEALS_EN[MEALS.indexOf(m)] : m);
const kindLabel = (k) => (S.lang === 'en' ? KIND_EN[k] : KINDS.find((x) => x[0] === k)[1]);
const catLabel = (c) => (S.lang === 'en' ? (CATS_EN[CATS.indexOf(c)] || c) : c);
const ingName = (i) => (S.lang === 'en' ? (ING_NAME_EN[i.name] || i.name) : i.name);
const recTitle = (r) => (S.lang === 'en' && REC_EN[r.title] ? REC_EN[r.title].title : r.title);
const recSteps = (r) => (S.lang === 'en' && REC_EN[r.title] ? REC_EN[r.title].steps : (r.steps || '').split('\n').filter(Boolean));
const tagLabel = (t) => (S.lang === 'en' ? TAG_NAME_EN[t.id] : t.name);
const curName = (code) => (S.lang === 'en' ? CUR[code][3] : CUR[code][2]);

// Личное состояние этого устройства в этой комнате: имя, черновик меню, галочки и временные цены в смете
const uiKey = () => `menu_ui_v6_${S.room ? S.room.id : ''}`;
const persist = () => {
  if (S.room && !S.room.demo) localStorage.setItem(uiKey(), JSON.stringify({ name: S.name, my: S.my, done: [...S.done], priceOv: S.priceOv }));
};
function loadUi() {
  const s = JSON.parse(localStorage.getItem(uiKey()) || '{}');
  S.name = s.name || ''; S.my = s.my || []; S.done = new Set(s.done || []); S.priceOv = s.priceOv || {};
}

const cur = () => CUR[S.settings.currency] || CUR.AMD;
const money = (n) => `${n.toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: cur()[1], maximumFractionDigits: cur()[1] })} ${cur()[0]}`;
const moneyC = (n, code) => `${n.toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: CUR[code][1], maximumFractionDigits: CUR[code][1] })} ${CUR[code][0]}`;

const ingById = (id) => S.ings.find((i) => i.id === id);
const ingByName = (n) => S.ings.find((i) => i.name.toLowerCase() === n.trim().toLowerCase());
const recipe = (id) => S.recipes.find((r) => r.id === id);
const valid = (list) => list.filter((e) => recipe(e.rid));
const sv = (r) => r.servings || 1; // на сколько порций указаны ингредиенты рецепта
const catOrder = (a, b) => (CATS.indexOf(a) + 100) % 100 - (CATS.indexOf(b) + 100) % 100 || a.localeCompare(b, 'ru');
const discOf = (name) => { const p = S.people.find((x) => x.name === name); return p ? p.discount || 0 : 0; };

// 1200 г → «1,2 кг», яйца в штуках
function fmt(amount, unit) {
  const n = (x) => String(Math.round(x * 100) / 100).replace('.', S.lang === 'en' ? '.' : ',');
  const u = unit === 'шт' ? L('шт', 'pcs') : L('кг', 'kg');
  return unit === 'г' && amount >= 1000 ? `${n(amount / 1000)} ${u}` : `${n(amount)} ${unit === 'шт' ? L('шт', 'pcs') : L('г', 'g')}`;
}
const priceUnit = (u) => (u === 'г' ? L('кг', 'kg') : L('шт', 'pcs'));
const costOf = (i, a) => (!i.price ? 0 : i.unit === 'шт' ? a * i.price : (a / 1000) * i.price);
// Всё считается на 1 порцию: количества в рецепте делим на число порций
const kcalOf = (r) => Math.round(r.items.reduce((s, it) => {
  const i = ingById(it.ingredient_id);
  return i ? s + (i.unit === 'шт' ? it.amount * i.kcal : (it.amount * i.kcal) / 100) : s;
}, 0) / sv(r));

// Оплата приготовления: свой коэффициент на каждый уровень сложности (★ / ★★ / ★★★), настраивается в базе продуктов
const DEFAULT_COOK_K = { 1: 0.7, 2: 1, 3: 1.5 };
const cookK = (diff) => S.settings[`cook_k${diff || 2}`] ?? DEFAULT_COOK_K[diff || 2];
const stars = (n = 2) => `<span class="stars"><span class="on">${'★'.repeat(n)}</span>${'★'.repeat(3 - n)}</span>`;
// Продукты 1 порции (соль, масло и воду не считаем, как и в списке покупок)
const dishFood = (r) => r.items.reduce((s, it) => {
  const i = ingById(it.ingredient_id);
  return i && !i.staple ? s + costOf(i, it.amount) : s;
}, 0) / sv(r);
const dishWork = (r) => dishFood(r) * cookK(r.difficulty);
const sumKcal = (list) => valid(list).reduce((s, e) => s + kcalOf(recipe(e.rid)), 0);
// Итоговые суммы округляем вверх до ближайшего ...00, ...50 или ...90 (для валют с копейками: до x,00, x,50 или x,90)
function roundTotal(n) {
  if (n <= 0) return 0;
  const u = cur()[1] ? 1 : 100, b = Math.floor(n / u) * u;
  return [b, b + 0.5 * u, b + 0.9 * u, b + u].find((c) => c >= n - 1e-9);
}
// Общий блок строк стоимости: продукты / приготовление / расходники (/ скидка) / итого
function renderCost(food, work, sup, note) {
  return `<div class="costs"><p class="grey">${L('Продукты', 'Ingredients')}: ${money(food)}</p>
    <p class="grey">${L('Приготовление', 'Preparation')}: ${money(work)}</p>
    <p class="grey">${L('Расходники', 'Supplies')}: ${money(sup)}</p>
    ${note ? `<p class="grey">${note}</p>` : ''}
    <p class="grand">${L('Итого', 'Total')}: ${money(roundTotal(food + work + sup))}</p></div>`;
}
function costLines(list, discountPct = 0) {
  const l = valid(list).map((e) => recipe(e.rid));
  const food = l.reduce((s, r) => s + dishFood(r), 0);
  const workFull = l.reduce((s, r) => s + dishWork(r), 0);
  const supFull = l.length * S.settings.supplies;
  const d = Math.min(100, Math.max(0, discountPct)) / 100;
  const note = discountPct > 0 ? `${L('Скидка на приготовление и расходники', 'Discount on preparation and supplies')}: ${discountPct}%` : '';
  return renderCost(food, workFull * (1 - d), supFull * (1 - d), note);
}
function finalCostLines(wishes) {
  let food = 0, work = 0, sup = 0, anyDisc = false;
  wishes.forEach((w) => {
    const l = valid(w.items).map((e) => recipe(e.rid));
    const f = l.reduce((s, r) => s + dishFood(r), 0);
    const wf = l.reduce((s, r) => s + dishWork(r), 0);
    const sf = l.length * S.settings.supplies;
    const d = discOf(w.person) / 100;
    if (d > 0) anyDisc = true;
    food += f; work += wf * (1 - d); sup += sf * (1 - d);
  });
  return renderCost(food, work, sup, anyDisc ? L('у некоторых участников есть скидка', 'some members have a discount') : '');
}

const flag = (c) => `<svg class="flag" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 1.5h7v13L8 11.5l-3.5 3z" fill="${c}" transform="rotate(45 8 8)"/></svg>`;
const tagHtml = (t) => `<span class="tag" title="${esc(tagLabel(t))}">${flag(t.color)}</span>`;
const ICON_EDIT = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14l1-3.5L11.5 2 14 4.5 5.5 13z"/></svg>';
const ICON_JOURNAL = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2.5" width="14" height="15" rx="1.5"/><path d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4"/></svg>';
const SUN = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="3.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16.5 12.5A7 7 0 1 1 7.5 3.5a5.6 5.6 0 0 0 9 9z"/></svg>';

/* ---------- Тема и язык (не зависят от комнаты) ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('menu_theme', t);
  const b = $('#theme-toggle');
  if (b) b.innerHTML = t === 'dark' ? SUN : MOON;
}
function initChrome() {
  applyTheme(localStorage.getItem('menu_theme') || 'light');
  $('#theme-toggle').title = L('Тёмная тема', 'Dark theme');
  $('#theme-toggle').setAttribute('aria-label', L('Тёмная тема', 'Dark theme'));
  $('#lang-toggle').textContent = S.lang === 'en' ? 'RU' : 'EN';
  $('#btn-add').textContent = `+ ${L('Рецепт', 'Recipe')}`;
}

/* ---------- Вход в комнату ---------- */
const EYE = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/><path class="slash" d="M3 17L17 3"/></svg>';
const pwField = (id, ac) => `<div class="pw"><input id="${id}" type="password" autocomplete="${ac}"><button type="button" class="eye" data-eye aria-label="${L('Показать пароль', 'Show password')}" title="${L('Показать пароль', 'Show password')}">${EYE}</button></div>`;

function showAuth(err = '') {
  const up = S.authMode === 'up';
  $('#view').innerHTML = `<section class="auth">
    <h2>${L('Вход в комнату', 'Sign in to a room')}</h2>
    <p class="meta">${L('Комната — общий вход для вашей группы. У каждой комнаты свои рецепты, имена, цены и меню недели.',
      'A room is a shared login for your group. Each room has its own recipes, names, prices and weekly menu.')}</p>
    <div class="tabs"><button class="tab ${up ? '' : 'on'}" data-authmode="in">${L('Войти', 'Sign in')}</button><button class="tab ${up ? 'on' : ''}" data-authmode="up">${L('Создать комнату', 'Create a room')}</button></div>
    <div class="field" style="margin-top:16px"><label for="a-login">${L('Логин комнаты', 'Room login')}</label><input id="a-login" autocomplete="username" value="${esc(S.authLogin)}"></div>
    <div class="field"><label for="a-pass">${L('Пароль', 'Password')}</label>${pwField('a-pass', up ? 'new-password' : 'current-password')}</div>
    ${up ? `<div class="field"><label for="a-pass2">${L('Повторите пароль', 'Repeat password')}</label>${pwField('a-pass2', 'new-password')}</div>` : ''}
    <p class="err" id="a-err">${esc(err)}</p>
    <div class="bar" style="margin-top:0"><button class="btn primary" data-authgo>${up ? L('Создать комнату', 'Create a room') : L('Войти', 'Sign in')}</button>
      <button class="btn" data-demo>${L('Просто посмотреть', 'Just take a look')}</button></div>
    ${up ? `<p class="meta" style="margin-top:12px">${L('Пароль не короче 6 символов. Запомните его: восстановить пароль нельзя.', 'Password must be at least 6 characters. Remember it: it cannot be recovered.')}</p>` : ''}
  </section>`;
}

function authError(e) {
  const m = String((e && e.message) || e);
  if (m === 'CONFIRM_EMAIL') return L('В Supabase включено подтверждение почты. Отключите «Confirm email» (Authentication → Sign In / Providers → Email).',
    'Supabase has email confirmation enabled. Turn off "Confirm email" (Authentication → Sign In / Providers → Email).');
  if (/Invalid login/i.test(m)) return L('Неверный логин или пароль.', 'Wrong login or password.');
  if (/already registered/i.test(m)) return L('Комната с таким логином уже есть. Выберите другой логин или войдите.', 'A room with this login already exists. Choose another login or sign in.');
  return m;
}

async function authGo() {
  const login = $('#a-login').value.trim(), pass = $('#a-pass').value, up = S.authMode === 'up';
  S.authLogin = login;
  if (login.length < 2) return showAuth(L('Логин слишком короткий.', 'Login is too short.'));
  if (pass.length < 6) return showAuth(L('Пароль не короче 6 символов.', 'Password must be at least 6 characters.'));
  if (up && pass !== $('#a-pass2').value) return showAuth(L('Пароли не совпадают.', 'Passwords do not match.'));
  try {
    S.room = await (up ? db.signUp(login, pass) : db.signIn(login, pass));
    await enterRoom();
  } catch (e) { S.room = null; showAuth(authError(e)); }
}

async function enterRoom() {
  await db.init();
  [S.ings, S.recipes, S.wishes, S.people, S.settings] = await Promise.all([
    db.getIngredients(), db.getRecipes(), db.getWishes(), db.getPeople(), db.getSettings()]);
  if (!S.room.demo) loadUi();
  if (S.name && !S.people.some((p) => p.name === S.name)) S.name = '';
  S.page = 'recipes';
  fillDatalist();
  render();
  // Туториал показываем через раз: на 1-й, 3-й, 5-й... вход в любую комнату на этом устройстве
  const seen = (+localStorage.getItem('menu_tut_count') || 0) + 1;
  localStorage.setItem('menu_tut_count', seen);
  if (seen % 2 === 1) openTutorial();
}

async function logout() {
  await db.signOut();
  Object.assign(S, { room: null, my: [], name: '', wishes: [], recipes: [], ings: [], people: [], authMode: 'in' });
  render();
}

/* ---------- Каркас ---------- */
function render() {
  $('#hdr-right').hidden = !S.room;
  if (!S.room) { $('#nav').innerHTML = ''; showAuth(); return; }
  $('#who').innerHTML = `${S.room.demo ? L('Демо · без сохранения', 'Demo · nothing is saved') : esc(S.room.login)} <button class="linkbtn" data-logout>${L('Выйти', 'Log out')}</button>`;
  $('#nav').innerHTML = PAGES.map(([id, ru, en]) => {
    const n = { my: S.my.length, week: S.wishes.length }[id];
    return `<button class="nav-btn ${S.page === id ? 'on' : ''}" data-nav="${id}">${L(ru, en)}${n === undefined ? '' : ` <b class="${n ? '' : 'zero'}">${n}</b>`}</button>`;
  }).join('');
  ({ recipes: viewRecipes, my: viewMy, week: viewWeek, shop: viewShop, base: viewBase, journal: viewJournal }[S.page])();
  persist();
}

/* ---------- Блюда ---------- */
function toolButtons() {
  return `<button class="btn" data-base>${L('База продуктов', 'Product database')}</button>
    <button class="btn sq" data-journal title="${L('Журнал изменений', 'Change log')}" aria-label="${L('Журнал изменений', 'Change log')}">${ICON_JOURNAL}</button>`;
}

function pickPanel() {
  const by = {};
  S.ings.filter((i) => !i.staple).forEach((i) => (by[i.category] ||= []).push(i));
  return Object.keys(by).sort(catOrder).map((c) => {
    const n = by[c].filter((i) => S.pick.has(i.id)).length;
    const open = S.openCats.has(c);
    return `<div class="cat">
      <button class="cat-head" data-cat="${esc(c)}">${open ? '▾' : '▸'} ${esc(catLabel(c))}${n ? ` · ${L('выбрано', 'selected')} ${n}` : ''}</button>
      ${open ? `<div class="chips">${by[c].sort((x, y) => ingName(x).localeCompare(ingName(y), S.lang)).map((i) =>
        `<button class="chip ${S.pick.has(i.id) ? 'on' : ''}" data-pick="${i.id}">${esc(ingName(i))}</button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function viewRecipes() {
  $('#view').innerHTML = `
    <div class="tabs">${MEALS.map((m) => `<button class="tab ${m === S.meal ? 'on' : ''}" data-m="${m}">${esc(mealLabel(m))}</button>`).join('')}</div>
    <div class="tools"><section class="toolbar">
      <input id="q" type="search" placeholder="${L('Найти блюдо', 'Find a dish')}" value="${esc(S.q)}">
      <div class="tagbar">${TAGS.map((t) =>
        `<button class="tagchip ${S.tags.has(t.id) ? 'on' : ''}" data-tag="${t.id}" title="${esc(tagLabel(t))}" aria-label="${esc(tagLabel(t))}">${flag(t.color)}</button>`).join('')}</div>
      <button class="btn ${S.pick.size ? 'sel' : ''}" data-pickbtn>${L('Продукты', 'Products')}</button>
    </section>
    ${S.showPick ? `<section class="pick">
      <div class="pick-top"><span class="meta">${L('Покажу блюда, где есть все выбранные продукты', 'Shows dishes that contain all selected products')}</span>
      <span>${toolButtons()} <button class="btn" data-pickreset ${S.pick.size ? '' : 'disabled'}>${L('Сбросить', 'Reset')}</button></span></div>${pickPanel()}</section>` : ''}
    </div>
    <div id="grid" class="grid"></div>`;
  renderGrid();
}

// Первый свободный слот, подходящий блюду (сначала раздел текущей вкладки)
function freeSlot(r) {
  const used = new Set(S.my.map((e) => e.slot));
  const meal = r.meals.includes(S.meal) ? S.meal : r.meals[0];
  const ok = ALL_SLOTS.filter((s) => !used.has(s) && NEED[kindOf(s)] === meal);
  return ok.find((s) => !s.endsWith('c')) || ok[0]
    || ALL_SLOTS.find((s) => !used.has(s) && r.meals.includes(NEED[kindOf(s)]));
}

// Кнопка «В рацион»: всегда одна и та же раскладка, поэтому ничего не двигается
function addBtn(r) {
  const cnt = S.my.filter((e) => e.rid === r.id).length;
  const can = !!freeSlot(r);
  const label = cnt ? `${L('Добавлено', 'Added')} ${cnt} · ${S.my.length} ${L('из', 'of')} ${MAX}`
    : can ? L('Добавить', 'Add') : L('Нет свободных слотов', 'No free slots');
  return `<div class="addwrap" data-rid="${r.id}">
    <button class="btn" data-less="${r.id}" ${cnt ? '' : 'disabled'} aria-label="${L('Убрать одно', 'Remove one')}">−</button>
    <button class="cnt" data-more="${r.id}" ${can ? '' : 'disabled'}>${label}</button>
    <button class="btn in" data-more="${r.id}" ${can ? '' : 'disabled'} aria-label="${L('Добавить ещё', 'Add one more')}">+</button></div>`;
}

function renderGrid() {
  const q = S.q.trim().toLowerCase();
  const list = S.recipes
    .filter((r) => r.meals.includes(S.meal) && recTitle(r).toLowerCase().includes(q)
      && [...S.tags].every((t) => (r.tags || []).includes(t))
      && [...S.pick].every((id) => r.items.some((it) => it.ingredient_id === id)))
    .sort((a, b) => recTitle(a).localeCompare(recTitle(b), S.lang));

  $('#grid').innerHTML = list.length ? list.map((r) => `
    <article class="card" data-card="${r.id}">
      <div class="card-top"><h3>${esc(recTitle(r))}</h3>
        <span class="icons"><button class="ic" data-editrec="${r.id}" title="${L('Изменить', 'Edit')}" aria-label="${L('Изменить', 'Edit')}">${ICON_EDIT}</button></span></div>
      <p class="meta">${stars(r.difficulty)} · ${kcalOf(r)} ${L('ккал', 'kcal')}</p>
      <div class="tags">${(r.tags || []).map((id) => tagHtml(TAGS.find((t) => t.id === id))).join('')}</div>
      ${addBtn(r)}
    </article>`).join('') : `<p class="empty">${L('Ничего не найдено. Измените фильтры или добавьте рецепт.', 'Nothing found. Change the filters or add a recipe.')}</p>`;
}

async function openRecipe(id) {
  $('#dlg').className = '';
  const r = recipe(id);
  const photoToken = (S._photoToken = (S._photoToken || 0) + 1); // чтобы не подставить фото в уже закрытое окно
  $('#dlg').innerHTML = `
    <div class="photo" id="r-photo"><span>${L('Загрузка…', 'Loading…')}</span></div>
    <h2>${esc(recTitle(r))}</h2>
    <p class="meta">${r.meals.map(mealLabel).join(', ')} · ${stars(r.difficulty)} · ${L('на 1 порцию', 'per serving')} ${kcalOf(r)} ${L('ккал', 'kcal')}</p>
    <p class="price">${L('Стоимость порции', 'Portion cost')}: <b>${money(dishFood(r) + dishWork(r))}</b></p>
    <div class="tags">${(r.tags || []).map((id) => tagHtml(TAGS.find((t) => t.id === id))).join('')}</div>
    <h3 style="margin-top:12px">${L('Ингредиенты', 'Ingredients')}${sv(r) > 1 ? ` (${L('на', 'for')} ${sv(r)} ${L('порц.', 'serv.')})` : ` (${L('на 1 порцию', 'per serving')})`}</h3>
    <ul class="ings">${r.items.map((it) => {
      const i = ingById(it.ingredient_id);
      return `<li>${esc(ingName(i))} — ${fmt(it.amount, i.unit)}</li>`;
    }).join('')}</ul>
    <h3>${L('Приготовление', 'Instructions')}</h3>
    <ol class="steps">${recSteps(r).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${addBtn(r)}
    <div class="foot">
      <button class="ic" data-editrec="${r.id}" title="${L('Изменить', 'Edit')}">${ICON_EDIT}</button>
      <button class="btn" data-close>${L('Закрыть', 'Close')}</button>
    </div>`;
  $('#dlg').showModal();
  db.getPhoto(id).then((photo) => { // фото подтягиваем отдельно — страница со списком блюд его не ждёт
    if (S._photoToken !== photoToken) return; // окно уже закрыли/сменили, этот ответ больше не актуален
    const box = document.getElementById('r-photo');
    if (box) box.innerHTML = photo ? `<img src="${photo}" alt="">` : `<span>${L('Фото можно добавить через ✎', 'Add a photo via ✎')}</span>`;
  });
}

/* ---------- Слоты недели ---------- */
const slotName = (s) => (s[0] === 'x' ? `${L('Десерт', 'Dessert')} ${+s[1] + 1}` : s[0] === 's' ? `${L('Салат', 'Salad')} ${+s[1] + 1}`
  : `${DAYS()[+s[0]]} · ${kindLabel(s[1])}`);

function slotTable(list, interactive = false) {
  const at = {};
  valid(list).forEach((e) => { at[e.slot] = e; });
  const cell = (s) => { const e = at[s]; const drag = interactive && e ? ' draggable="true"' : '';
    return `<td><button class="slotbtn ${e ? 'on' : ''}" data-slot="${s}"${drag} title="${slotName(s)}">${
    e ? `<span class="t">${esc(recTitle(recipe(e.rid)))}</span>` : '<span class="plus">+</span>'}</button></td>`; };
  const kc = (f) => sumKcal(list.filter(f)) || '';
  const extra = (k, label) => `<tr class="dess"><th>${label}</th>${[0, 1, 2].map((n) => cell(`${k}${n}`)).join('')}<td></td>
      <td class="kc">${kc((e) => e.slot[0] === k)}</td></tr>`;
  return `<div class="tbl-wrap"><table class="slots">
    <thead><tr><th></th><th colspan="2">${L('Завтрак', 'Breakfast')}</th><th>${L('Обед', 'Lunch')}</th><th>${L('Ужин', 'Dinner')}</th><th>${L('ккал', 'kcal')}</th></tr></thead>
    <tbody>${DAYS().map((_, i) => `<tr><th>${SD()[i]}</th>${KINDS.map(([k]) => cell(`${i}${k}`)).join('')}
      <td class="kc">${kc((e) => e.slot[0] === String(i))}</td></tr>`).join('')}
      ${extra('s', L('Салаты', 'Salads'))}${extra('x', L('Десерты', 'Desserts'))}
    </tbody></table></div>`;
}

function summary(list) {
  const l = valid(list), k = sumKcal(l);
  return `${L('Выбрано', 'Selected')} ${l.length} ${L('из', 'of')} ${MAX} · ${L('за неделю', 'per week')} ${k.toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU')} ${L('ккал', 'kcal')}`
    + (k ? ` (≈ ${Math.round(k / 7).toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU')} ${L('в день', 'per day')})` : '');
}

// Окно выбора блюда для слота
function openSlot(slot) {
  $('#dlg').className = '';
  const cur0 = S.my.find((e) => e.slot === slot);
  const list = S.recipes.filter((r) => r.meals.includes(NEED[kindOf(slot)])).sort((a, b) => recTitle(a).localeCompare(recTitle(b), S.lang));
  $('#dlg').innerHTML = `
    <h2>${slotName(slot)}</h2>
    <div class="slot-top"><input id="slot-q" type="search" placeholder="${L('Найти блюдо', 'Find a dish')}">
      <button class="btn" data-clearslot="${slot}" ${cur0 ? '' : 'disabled'}>${L('Очистить слот', 'Clear slot')}</button></div>
    <div class="pick-list">${list.map((r) => `
      <button class="pick-row ${cur0 && cur0.rid === r.id ? 'on' : ''}" data-setslot="${slot}" data-pickrid="${r.id}">
        <span class="t">${esc(recTitle(r))}</span><span class="tags">${(r.tags || []).map((id) => tagHtml(TAGS.find((t) => t.id === id))).join('')}</span>
        <span class="meta">${kcalOf(r)} ${L('ккал', 'kcal')}</span></button>`).join('')}</div>
    <div class="foot"><button class="btn" data-close>${L('Закрыть', 'Close')}</button></div>`;
  $('#dlg').showModal();
}

function setSlot(slot, rid) {
  S.my = S.my.filter((e) => e.slot !== slot);
  if (rid) S.my.push({ rid, slot });
}

// Перетаскивание блюд в «Рационе»: тянем одно блюдо на другой слот — они меняются местами
document.addEventListener('dragstart', (e) => {
  const b = e.target.closest('.slotbtn[draggable="true"]');
  if (!b) return;
  e.dataTransfer.setData('text/plain', b.dataset.slot);
  e.dataTransfer.effectAllowed = 'move';
  b.classList.add('dragging');
});
document.addEventListener('dragend', (e) => { const b = e.target.closest('.slotbtn'); if (b) b.classList.remove('dragging'); });
document.addEventListener('dragover', (e) => { if (e.target.closest('.slots')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  const target = e.target.closest('.slotbtn');
  if (!target) return;
  e.preventDefault();
  const from = e.dataTransfer.getData('text/plain'), to = target.dataset.slot;
  if (!from || from === to) return;
  const a = S.my.find((x) => x.slot === from), b = S.my.find((x) => x.slot === to);
  if (!a) return;
  const ra = recipe(a.rid);
  if (!ra || !ra.meals.includes(NEED[kindOf(to)])) return; // блюдо не подходит разделу этого слота
  if (b) {
    const rb = recipe(b.rid);
    if (!rb || !rb.meals.includes(NEED[kindOf(from)])) return; // и второе блюдо туда обратно не встанет
  }
  a.slot = to;
  if (b) b.slot = from;
  render();
});

/* ---------- Имена людей в комнате и скидки ---------- */
function fillNames() {
  $('#dlg').className = '';
  $('#dlg').innerHTML = `
    <h2>${L('Имена в комнате', 'Names in the room')}</h2>
    <p class="meta">${L('Они появятся в «Рационе» кнопками для быстрого выбора. Скидки настраиваются в «Базе продуктов».',
      'They appear in "My menu" as quick-pick buttons. Discounts are set in the "Product database" page.')}</p>
    <div class="slot-top" style="margin-top:12px"><input id="n-new" placeholder="${L('Новое имя', 'New name')}" maxlength="20" autocomplete="off">
      <button class="btn primary" data-addname>${L('Добавить', 'Add')}</button></div>
    <ul class="tally names">${S.people.map((p) => `<li><span>${esc(p.name)}</span>
      <button class="x" data-delname="${esc(p.name)}" aria-label="${L('Удалить имя', 'Delete name')}">×</button></li>`).join('')}</ul>
    <div class="foot"><button class="btn" data-close>${L('Готово', 'Done')}</button></div>`;
}
function openNames() { fillNames(); if (!$('#dlg').open) $('#dlg').showModal(); }

async function addName() {
  const n = $('#n-new').value.trim();
  if (!n) return;
  if (!S.people.some((p) => p.name === n)) {
    await db.addPerson(n);
    S.people.push({ name: n, discount: 0 });
    S.people.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  S.name = n;
  fillNames(); render();
}

/* ---------- Рацион ---------- */
function viewMy() {
  const list = valid(S.my);
  $('#view').innerHTML = `<section class="page page-wide">
    <h2>${L('Рацион на неделю', 'My menu for the week')}</h2>
    <p class="meta">${L('Нажмите на слот и выберите блюдо. Заполнять все слоты не нужно.', 'Click a slot and pick a dish. You don\'t need to fill every slot.')}</p>
    <div class="field" style="margin-top:16px"><label>${L('Кто вы', 'Who are you')}</label>
      <div class="people">${S.people.map((p) => `<button class="chip big ${S.name === p.name ? 'on' : ''}" data-person="${esc(p.name)}">${esc(p.name)}</button>`).join('')}
      <button class="chip big add" data-names>${S.people.length ? `+ ${L('Имя', 'Name')}` : L('+ Добавить своё имя', '+ Add your name')}</button></div></div>
    <p class="sum">${summary(list)}</p>
    ${slotTable(list, true)}
    <p class="meta" style="margin-top:4px">${L('Блюда в рационе можно перетаскивать мышью, чтобы поменять местами.', 'Drag dishes to swap their places.')}</p>
    ${costLines(list, discOf(S.name))}
    <div class="bar">
      <button class="btn primary" data-send ${list.length ? '' : 'disabled'}>${L('Отправить в меню недели', 'Send to weekly menu')}</button>
      <button class="btn" data-nav="recipes">${L('Выбрать из блюд', 'Pick from dishes')}</button>
      <button class="btn" data-clearmy ${list.length ? '' : 'disabled'}>${L('Очистить всё', 'Clear all')}</button>
    </div></section>`;
}

async function sendMenu() {
  if (!S.name) return alert(L('Добавьте и выберите своё имя (кнопка «+ Имя»).', 'Add and select your name (the "+ Name" button).'));
  if (S.wishes.some((w) => w.person === S.name) && !confirm(L(`У «${S.name}» уже есть карточка. Заменить её новой?`, `"${S.name}" already has a card. Replace it with the new one?`))) return;
  await db.saveWish(S.name, valid(S.my).map((e) => ({ rid: e.rid, slot: e.slot })));
  S.wishes = await db.getWishes();
  S.my = []; S.name = ''; // вкладка освобождается для следующего человека
  S.page = 'week';
  render();
}

/* ---------- Меню недели: карточки людей и общий список блюд ---------- */
const tally = (items) => {
  const m = {};
  valid(items).forEach((e) => { m[e.rid] = (m[e.rid] || 0) + 1; });
  return Object.entries(m).map(([rid, n]) => ({ r: recipe(rid), n }))
    .sort((a, b) => b.n - a.n || recTitle(a.r).localeCompare(recTitle(b.r), S.lang));
};
const tallyList = (t, withCost) => `<ul class="tally">${t.map(({ r, n }) => `<li><span>${esc(recTitle(r))}</span><b>×${n}</b>${
  withCost ? `<span class="c">${money(n * (dishFood(r) + dishWork(r)))}</span>` : ''}</li>`).join('')}</ul>`;

function viewWeek() {
  const all = S.wishes.flatMap((w) => valid(w.items));
  $('#view').innerHTML = `<section class="page page-wide">
    <h2>${L('Меню недели', 'Weekly menu')}</h2>
    ${S.wishes.length ? `<div class="bar"><button class="btn primary" data-nav="shop">${L('Список покупок', 'Shopping list')}</button>
      <button class="btn" data-newweek>${L('Начать новую неделю', 'Start a new week')}</button></div>
      <div class="wgrid">${S.wishes.map((w) => `
        <article class="wcard"><div class="wtop"><h3>${esc(w.person)}</h3>
          <span class="meta">${valid(w.items).length} ${L('порц.', 'serv.')} · ${sumKcal(w.items).toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU')} ${L('ккал', 'kcal')}</span></div>
          ${tallyList(tally(w.items))}${costLines(w.items, discOf(w.person))}
          <div class="foot"><button class="btn" data-edit="${esc(w.person)}">${L('Редактировать', 'Edit')}</button>
          <button class="btn" data-del="${esc(w.person)}">${L('Удалить', 'Delete')}</button></div></article>`).join('')}</div>
      <section class="final"><h3>${L('Всего порций на неделю', 'Total servings for the week')}: ${all.length}</h3>${tallyList(tally(all), true)}${finalCostLines(S.wishes)}</section>`
      : `<p class="empty">${L('Пока никто не отправил меню. Заполните «Рацион» и нажмите «Отправить в меню недели».',
          'No one has sent a menu yet. Fill in "My menu" and click "Send to weekly menu".')}</p>`}
  </section>`;
}

/* ---------- Покупки (чек закупки в моменте) ---------- */
// Цена в смете: правка по факту в магазине (если есть), иначе цена из базы продуктов. База не меняется.
const effPrice = (i) => S.priceOv[i.id] ?? i.price;
const shopCost = (i, a) => { const p = effPrice(i); return !p ? 0 : i.unit === 'шт' ? a * p : (a / 1000) * p; };

function viewShop() {
  const sum = new Map();
  const per = S.wishes.map((w) => ({ person: w.person, n: 0, raw: 0 }));
  S.wishes.forEach((w, wi) => valid(w.items).forEach((e) => {
    const r = recipe(e.rid);
    per[wi].n++;
    r.items.forEach((x) => {
      const amount = x.amount / sv(r); // на 1 порцию
      sum.set(x.ingredient_id, (sum.get(x.ingredient_id) || 0) + amount);
      const i = ingById(x.ingredient_id);
      if (i && !i.staple) per[wi].raw += shopCost(i, amount);
    });
  }));
  // Соль, масло и воду не покупаем (помечены «всегда есть дома»). Штуки округляем вверх.
  const need = [...sum].map(([id, a]) => {
    const ing = ingById(id);
    return ing && { ing, qty: ing.unit === 'шт' ? Math.ceil(a - 1e-9) : a };
  }).filter((x) => x && !x.ing.staple);
  const total = roundTotal(need.reduce((s, x) => s + shopCost(x.ing, x.qty), 0));
  const rawSum = per.reduce((s, p) => s + p.raw, 0);
  const noPrice = need.filter((x) => !effPrice(x.ing)).length;
  const groups = {};
  need.forEach((x) => (groups[x.ing.category] ||= []).push(x));

  $('#view').innerHTML = `<section class="page">
    <h2>${L('Список покупок', 'Shopping list')}</h2>
    <div class="bar" style="margin-top:8px">${toolButtons()}</div>
    ${need.length ? `
      ${Object.keys(groups).sort(catOrder).map((cat) => `
        <div class="group">${esc(catLabel(cat))}</div>
        ${groups[cat].sort((a, b) => ingName(a.ing).localeCompare(ingName(b.ing), S.lang)).map((x) => `
          <div class="shop-item ${S.done.has(x.ing.id) ? 'done' : ''}">
            <input type="checkbox" data-done="${x.ing.id}" ${S.done.has(x.ing.id) ? 'checked' : ''} aria-label="${L('Куплено', 'Bought')}">
            <span class="nm">${esc(ingName(x.ing))}</span>
            <span class="qty">${fmt(x.qty, x.ing.unit)}</span>
            <span class="pr"><input type="number" min="0" step="any" class="${S.priceOv[x.ing.id] !== undefined ? 'ovr' : ''}" data-price="${x.ing.id}" value="${effPrice(x.ing) ?? ''}" placeholder="${L('цена', 'price')}"> ${cur()[0]}/${priceUnit(x.ing.unit)}</span>
            <span class="cost">${effPrice(x.ing) ? money(shopCost(x.ing, x.qty)) : '—'}</span>
          </div>`).join('')}`).join('')}
      <div class="totals">
        <h3>${L('Итого', 'Total')}: ${money(total)}</h3>
        ${noPrice ? `<p class="meta">${L('Без цены', 'No price')}: ${noPrice} ${L('продуктов, они считаются как 0.', 'products, counted as 0.')}</p>` : ''}
        <table class="ptable"><thead><tr><th>${L('Кто', 'Who')}</th><th>${L('Порций', 'Servings')}</th><th>${L('Сумма', 'Amount')}</th></tr></thead><tbody>
          ${per.map((p) => `<tr><td>${esc(p.person)}</td><td>${p.n}</td><td>${money(rawSum ? (p.raw / rawSum) * total : 0)}</td></tr>`).join('')}
        </tbody></table>
        <p class="meta">${L('Общая покупка делится по стоимости блюд каждого человека.', 'The shared purchase is split by the cost of each person\'s dishes.')}</p>
      </div>`
      : `<p class="empty">${L('Список пуст. Он соберётся из карточек на странице «Меню недели».', 'The list is empty. It will be built from the cards on the "Weekly menu" page.')}</p>`}
  </section>`;
}

/* ---------- База продуктов и настройки комнаты ---------- */
function viewBase() {
  const by = {};
  S.ings.forEach((i) => (by[i.category] ||= []).push(i));
  $('#view').innerHTML = `<section class="page page-wide">
    <div class="bar" style="margin-top:0"><button class="btn" data-nav="${S.baseFrom}">← ${L('Назад', 'Back')}</button></div>
    <h2 style="margin-top:12px">${L('База продуктов и настройки', 'Product database and settings')}</h2>
    <div class="settings">
      <div class="field"><label for="cur-sel">${L('Валюта', 'Currency')}</label><select id="cur-sel">${Object.keys(CUR).map((k) =>
        `<option value="${k}" ${S.settings.currency === k ? 'selected' : ''}>${curName(k)} (${CUR[k][0]})</option>`).join('')}</select></div>
      <div class="field"><label for="sup-in">${L('Расходники за порцию', 'Supplies per serving')}, ${cur()[0]}</label>
        <input id="sup-in" type="number" min="0" step="any" value="${S.settings.supplies}"></div>
      <div class="field"><label>${L('Оплата за приготовление по сложности', 'Preparation pay by difficulty')}</label>
        <div class="cookk">
          <label>${stars(1)}<input id="cook1-in" type="number" min="0" step="0.25" value="${S.settings.cook_k1 ?? 0.7}"></label>
          <label>${stars(2)}<input id="cook2-in" type="number" min="0" step="0.25" value="${S.settings.cook_k2 ?? 1}"></label>
          <label>${stars(3)}<input id="cook3-in" type="number" min="0" step="0.25" value="${S.settings.cook_k3 ?? 1.5}"></label>
        </div></div>
    </div>
    <h3 style="margin-top:16px">${L('Скидки', 'Discounts')}</h3>
    ${S.people.length ? `<div class="discounts">${S.people.map((p) => `
      <div class="disc-row"><span>${esc(p.name)}</span>
        <select class="disc-sel" data-disc="${esc(p.name)}">
          ${DISCOUNTS.map((v) => `<option value="${v}" ${p.discount === v ? 'selected' : ''}>${v}%</option>`).join('')}
        </select></div>`).join('')}</div>`
      : `<p class="meta">${L('Пока нет имён. Добавьте их на странице «Рацион».', 'No names yet. Add them on the "My menu" page.')}</p>`}
    <h3 style="margin-top:16px">${L('Новый продукт', 'New product')}</h3>
    <div class="newing">
      <input id="ni-name" type="text" placeholder="${L('Название', 'Name')}" autocomplete="off">
      <select id="ni-cat">${CATS.map((c) => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('')}</select>
      <input id="ni-price" type="number" min="0" step="any" placeholder="${L('Цена за кг', 'Price per kg')}, ${cur()[0]}">
      <input id="ni-kcal" type="number" min="0" step="any" placeholder="${L('ккал на 100 г', 'kcal per 100g')}">
      <button class="btn primary" data-newing>${L('Добавить', 'Add')}</button>
    </div>
    <p class="meta">${L('Цена за кг (яйца за штуку), калории на 100 г (яйца на штуку).', 'Price per kg (eggs per piece), calories per 100g (eggs per piece).')}
      <button class="linkbtn" data-reseed>${L('Сбросить цены и калории к стартовым', 'Reset prices and calories to defaults')}</button></p>
    <input id="base-q" type="search" class="search" placeholder="${L('Найти продукт', 'Find a product')}">
    <div class="tbl-wrap"><table class="base">
      <thead><tr><th>${L('Продукт', 'Product')}</th><th>${L('Цена', 'Price')}, ${cur()[0]}</th><th>${L('ккал', 'kcal')}</th><th></th></tr></thead>
      ${Object.keys(by).sort(catOrder).map((c) => `<tbody><tr class="cat-row"><th colspan="4">${esc(catLabel(c))}</th></tr>
        ${by[c].sort((x, y) => ingName(x).localeCompare(ingName(y), S.lang)).map((i) => `<tr data-name="${esc(ingName(i).toLowerCase())}">
          <td><input type="text" data-bname="${i.id}" value="${esc(i.name)}"></td>
          <td><input type="number" min="0" step="any" data-bprice="${i.id}" value="${i.price ?? ''}"></td>
          <td><input type="number" min="0" step="any" data-bkcal="${i.id}" value="${i.kcal}"></td>
          <td><button class="x" data-bdel="${i.id}" title="${L('Удалить продукт', 'Delete product')}" aria-label="${L('Удалить продукт', 'Delete product')}">×</button></td></tr>`).join('')}</tbody>`).join('')}
    </table></div></section>`;
}

/* ---------- Журнал изменений (только чтение) ---------- */
function journalText(e) {
  const d = e.data || {};
  const T = {
    ing_price: L(`Цена «${d.name}»: ${d.old ?? '—'} → ${d.new ?? '—'}`, `Price of "${d.name}": ${d.old ?? '—'} → ${d.new ?? '—'}`),
    ing_kcal: L(`Калории «${d.name}»: ${d.old} → ${d.new}`, `Calories of "${d.name}": ${d.old} → ${d.new}`),
    ing_name: L(`Переименован продукт: «${d.old}» → «${d.new}»`, `Product renamed: "${d.old}" → "${d.new}"`),
    ing_add: L(`Добавлен продукт: ${d.name}`, `Product added: ${d.name}`),
    ing_add_many: L(`Добавлено продуктов в базу: ${d.n}`, `${d.n} products added to the database`),
    ing_del: L(`Удалён продукт: ${d.name}`, `Product deleted: ${d.name}`),
    rec_add: L(`Добавлено блюдо: ${d.title}`, `Dish added: ${d.title}`),
    rec_edit: L(`Изменено блюдо: ${d.title}${d.old && d.old !== d.title ? ` (было «${d.old}»)` : ''}`, `Dish edited: ${d.title}${d.old && d.old !== d.title ? ` (was "${d.old}")` : ''}`),
    rec_del: L(`Удалено блюдо: ${d.title}`, `Dish deleted: ${d.title}`),
    person_add: L(`Добавлено имя: ${d.name}`, `Name added: ${d.name}`),
    person_del: L(`Удалено имя: ${d.name}`, `Name deleted: ${d.name}`),
    person_disc: L(`Скидка для ${d.name}: ${d.old}% → ${d.new}%`, `Discount for ${d.name}: ${d.old}% → ${d.new}%`),
    set_cur: L(`Валюта: ${d.old} → ${d.new}`, `Currency: ${d.old} → ${d.new}`),
    set_sup: L(`Расходники за порцию: ${d.old} → ${d.new}`, `Supplies per serving: ${d.old} → ${d.new}`),
    set_cook: L(`Оплата за ${'★'.repeat(d.star)}: ${d.old} → ${d.new}`, `Pay for ${'★'.repeat(d.star)}: ${d.old} → ${d.new}`),
    cur_change: L(`Смена валюты: ${d.old} → ${d.new} (курс ${d.rate})`, `Currency changed: ${d.old} → ${d.new} (rate ${d.rate})`),
  };
  if (e.kind === 'week') {
    const snap = snapCost(d);
    return L(`Неделя завершена: ${snap.portions} порций, ${moneyC(snap.total, d.settings.currency)}`,
      `Week closed: ${snap.portions} servings, ${moneyC(snap.total, d.settings.currency)}`);
  }
  return T[e.kind] || e.kind;
}

// Стоимость снимка недели на момент её завершения (своя валюта и настройки того момента)
function snapCost(snap) {
  const recMap = Object.fromEntries((snap.recipes || []).map((r) => [r.id, r]));
  const peopleMap = Object.fromEntries((snap.people || []).map((p) => [p.name, p.discount || 0]));
  let food = 0, work = 0, sup = 0, portions = 0;
  (snap.wishes || []).forEach((w) => {
    const d = (peopleMap[w.person] || 0) / 100;
    (w.items || []).filter((it) => recMap[it.rid]).forEach((it) => {
      const r = recMap[it.rid];
      const f = r.items.reduce((s, x) => (x.s ? s : s + (x.p ? (x.u === 'шт' ? x.a * x.p : (x.a / 1000) * x.p) : 0)), 0) / (r.servings || 1);
      const diff = r.difficulty || 2;
      // снимки недель, сохранённые до этого обновления, несли один общий cook_mult вместо трёх коэффициентов
      const k = snap.settings[`cook_k${diff}`] ?? (DEFAULT_COOK_K[diff] * (snap.settings.cook_mult ?? 1));
      const w1 = f * k;
      food += f; work += w1 * (1 - d); sup += snap.settings.supplies * (1 - d); portions++;
    });
  });
  return { food, work, sup, portions, total: Math.max(0, food + work + sup) };
}

async function openJournal() {
  if (S.journal === null) S.journal = await db.getJournal();
  renderJournal();
}

function renderJournal() {
  $('#view').innerHTML = `<section class="page page-wide">
    <div class="bar" style="margin-top:0"><button class="btn" data-nav="${S.baseFrom}">← ${L('Назад', 'Back')}</button></div>
    <h2 style="margin-top:12px">${L('Журнал изменений', 'Change log')}</h2>
    <p class="meta">${L('Последние 1000 записей. Этот список нельзя отредактировать или удалить.', 'The last 1000 entries. This list cannot be edited or deleted.')}</p>
    ${S.journal === null ? `<p class="empty">${L('Журнал станет доступен после обновления базы данных (выполните upgrade.sql).',
        'The log will be available after a database update (run upgrade.sql).')}</p>`
      : S.journal.length ? `<div class="journal">${S.journal.map((e) => `
          <div class="jrow ${e.red ? 'red' : ''}"><span class="jwhen">${new Date(e.at).toLocaleString(S.lang === 'en' ? 'en-US' : 'ru-RU')}</span>
          <span class="jtext">${esc(journalText(e))}</span></div>`).join('')}</div>`
      : `<p class="empty">${L('Пока пусто.', 'Nothing yet.')}</p>`}
  </section>`;
}
function viewJournal() { renderJournal(); }

/* ---------- Форма рецепта (создание и редактирование) ---------- */
function ingRow(it) {
  const i = it && ingById(it.ingredient_id);
  return `<div class="row ing-row">
    <input class="name" list="ing-list" placeholder="${L('Продукт', 'Product')}" autocomplete="off" value="${i ? esc(i.name) : ''}">
    <input class="amt" type="number" min="0" step="any" placeholder="${L('Кол-во', 'Amount')}" value="${it ? it.amount : ''}">
    <span class="u">${i ? i.unit : 'г'}</span>
    <button class="x" type="button" data-delrow aria-label="${L('Убрать строку', 'Remove row')}">×</button>
    <div class="extra" hidden><select class="cat">${CATS.map((c) => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('')}</select>
      <input class="kc" type="number" min="0" placeholder="${L('ккал на 100 г', 'kcal per 100g')}"></div>
  </div>`;
}

function formKcal() {
  let k = 0;
  document.querySelectorAll('.ing-row').forEach((row) => {
    const a = parseFloat(row.querySelector('.amt').value) || 0;
    const i = ingByName(row.querySelector('.name').value);
    const kc = i ? i.kcal : parseFloat(row.querySelector('.kc').value) || 0;
    k += i && i.unit === 'шт' ? a * kc : (a * kc) / 100;
  });
  const n = S.editId ? sv(recipe(S.editId)) : 1;
  const el = $('#f-kcal');
  if (el) el.textContent = `≈ ${Math.round(k / n)} ${L('ккал на порцию', 'kcal per serving')}`;
}

function openForm(id) {
  const r = id ? recipe(id) : null;
  S.editId = id || null;
  S.formPhoto = ''; S.formPhotoOriginal = ''; // настоящее фото подтянется отдельно — см. ниже
  S.formPhotoBlob = null;
  S.photoChanged = false;
  const photoToken = (S._photoToken = (S._photoToken || 0) + 1);
  const has = (arr, v) => r && (r[arr] || []).includes(v) ? 'checked' : '';
  $('#dlg').className = 'form';
  $('#dlg').innerHTML = `<div class="dlg-body">
    <h2>${r ? L('Изменить рецепт', 'Edit recipe') : L('Новый рецепт', 'New recipe')}</h2>
    <div class="field"><label>${L('Название', 'Name')}</label><input id="f-title" placeholder="${L('Например, плов', 'E.g. Pilaf')}" value="${r ? esc(r.title) : ''}"></div>
    <div class="field"><label>${L('Раздел', 'Section')}</label>
      <div class="checks">${MEALS.map((m) => `<label><input type="checkbox" name="meal" value="${m}" ${has('meals', m)}> ${esc(mealLabel(m))}</label>`).join('')}</div></div>
    <div class="two">
      <div class="field"><label>${L('Теги', 'Tags')}</label>
        <div class="checks">${TAGS.map((t) => `<label title="${esc(tagLabel(t))}"><input type="checkbox" name="tag" value="${t.id}" ${has('tags', t.id)}> ${flag(t.color)}</label>`).join('')}</div></div>
      <div class="field"><label>${L('Сложность', 'Difficulty')}</label>
        <div class="checks">${[1, 2, 3].map((n) => `<label><input type="radio" name="diff" value="${n}" ${(r ? r.difficulty || 2 : 2) === n ? 'checked' : ''}> ${stars(n)}</label>`).join('')}</div></div>
    </div>
    <div class="field"><label>${L('Фото', 'Photo')}</label>
      <div class="photo sm" id="f-prev"><span>${r ? L('Загрузка…', 'Loading…') : L('Нет фото', 'No photo')}</span></div>
      <div class="bar" style="margin-top:8px"><label class="btn">${L('Выбрать файл', 'Choose file')}<input id="f-photo" type="file" accept="image/*" hidden></label>
        <button class="btn" type="button" data-rmphoto>${L('Убрать фото', 'Remove photo')}</button></div></div>
    <div class="field"><label>${L('Ингредиенты', 'Ingredients')}</label>
      <div id="ing-rows">${r ? r.items.map(ingRow).join('') : ingRow() + ingRow() + ingRow()}</div>
      <button class="btn" id="add-row" type="button">+ ${L('Ещё продукт', 'More products')}</button>
      <p class="meta">${L('Начните вводить название. Нового продукта нет в списке? Выберите категорию и калорийность, он добавится в базу.',
        'Start typing a name. New product not in the list? Pick a category and calories, it will be added to the database.')}</p>
      <p class="sum" id="f-kcal"></p></div>
    <div class="field"><label>${L('Шаги (каждый с новой строки)', 'Steps (one per line)')}</label><textarea id="f-steps" rows="5">${r ? esc(r.steps || '') : ''}</textarea></div>
    </div>
    <div class="foot dlg-foot">${r ? `<button class="btn warn" data-delrec="${r.id}" style="margin-right:auto">${L('Удалить рецепт', 'Delete recipe')}</button>` : ''}
      <button class="btn" data-close>${L('Отмена', 'Cancel')}</button><button class="btn primary" id="save-recipe">${L('Сохранить', 'Save')}</button></div>`;
  $('#dlg').showModal();
  formKcal();
  if (r) {
    db.getPhoto(id).then((photo) => {
      if (S._photoToken !== photoToken) return; // форму уже закрыли или открыли другую
      S.formPhoto = photo; S.formPhotoOriginal = photo;
      const prev = $('#f-prev');
      if (prev) prev.innerHTML = photo ? `<img src="${photo}" alt="">` : `<span>${L('Нет фото', 'No photo')}</span>`;
    });
  }
}

async function saveRecipe() {
  const title = $('#f-title').value.trim();
  const checked = (n) => [...document.querySelectorAll(`[name=${n}]:checked`)].map((c) => c.value);
  const meals = checked('meal');
  if (!title || !meals.length) return alert(L('Укажите название и хотя бы один раздел.', 'Enter a name and at least one section.'));

  const items = [];
  for (const row of document.querySelectorAll('.ing-row')) {
    const name = row.querySelector('.name').value.trim();
    const amount = parseFloat(row.querySelector('.amt').value);
    if (!name || !(amount > 0)) continue;
    let ing = ingByName(name);
    if (!ing) {
      ing = await db.addIngredient({
        name, unit: 'г', category: row.querySelector('.cat').value,
        kcal: parseFloat(row.querySelector('.kc').value) || 0,
      });
      S.ings.push(ing);
    }
    items.push({ ingredient_id: ing.id, amount });
  }
  if (!items.length) return alert(L('Добавьте хотя бы один ингредиент с количеством.', 'Add at least one ingredient with an amount.'));

  const before = S.editId ? recipe(S.editId) : null;
  let photo = S.formPhotoOriginal || ''; // настоящее фото, подтянутое отдельно при открытии формы (см. openForm)
  if (S.photoChanged) {
    photo = '';
    if (S.formPhotoBlob) {
      try { photo = (await db.uploadPhoto(S.formPhotoBlob)) || S.formPhoto; } // не вышло загрузить в облако — сохраняем как раньше, прямо в базе
      catch (e) { photo = S.formPhoto; }
    }
    if (S.formPhotoOriginal && S.formPhotoOriginal !== photo) db.removeStoredPhoto(S.formPhotoOriginal);
  }
  const data = {
    title, meals, tags: checked('tag'), difficulty: +(document.querySelector('[name=diff]:checked') || {}).value || 2,
    servings: before ? sv(before) : 1, items, photo, steps: $('#f-steps').value.trim(),
  };
  if (S.editId) await db.updateRecipe(S.editId, data); else await db.addRecipe(data);
  S.recipes = await db.getRecipes();
  fillDatalist();
  $('#dlg').close();
  S.page = 'recipes';
  render();
}

function readPhoto(file) { // уменьшаем до 900 px и сразу готовим и превью, и файл для загрузки в облако
  return new Promise((resolve) => {
    const fr = new FileReader(), img = new Image();
    fr.onload = () => { img.src = fr.result; };
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      c.toBlob((blob) => resolve({ dataUrl, blob }), 'image/jpeg', 0.8);
    };
    fr.readAsDataURL(file);
  });
}

const fillDatalist = () => { $('#ing-list').innerHTML = S.ings.map((i) => `<option value="${esc(i.name)}">`).join(''); };

function addOne(rid) { const s = freeSlot(recipe(rid)); if (s) S.my.push({ rid, slot: s }); }
function removeOne(rid) { const i = S.my.map((e) => e.rid).lastIndexOf(rid); if (i >= 0) S.my.splice(i, 1); }

/* ---------- События ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const get = (sel) => t.closest(sel);

  if (get('[data-theme-toggle]') || t.id === 'theme-toggle' || t.closest('#theme-toggle')) {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); return;
  }
  if (get('[data-tut-close]') || t.id === 'tutorial') { closeTutorial(); return; }
  if (t.id === 'lang-toggle' || t.closest('#lang-toggle')) {
    S.lang = S.lang === 'en' ? 'ru' : 'en';
    localStorage.setItem('menu_lang', S.lang);
    $('#lang-toggle').textContent = S.lang === 'en' ? 'RU' : 'EN';
    $('#btn-add').textContent = `+ ${L('Рецепт', 'Recipe')}`;
    $('#theme-toggle').title = L('Тёмная тема', 'Dark theme');
    $('#theme-toggle').setAttribute('aria-label', L('Тёмная тема', 'Dark theme'));
    render();
    return;
  }
  if (S.showPick && !get('.pick') && !get('[data-pickbtn]')) { S.showPick = false; render(); } // клик мимо панели закрывает её
  if (get('[data-authmode]')) { S.authLogin = ($('#a-login') || {}).value || ''; S.authMode = get('[data-authmode]').dataset.authmode; showAuth(); return; }
  if (get('[data-authgo]')) { await authGo(); return; }
  if (get('[data-demo]')) { S.room = db.enterDemo(); await enterRoom(); return; }
  if (get('[data-eye]')) { // глазик: показать / скрыть пароль
    const b = get('[data-eye]'), inp = b.closest('.pw').querySelector('input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.classList.toggle('on', show);
    b.setAttribute('aria-label', show ? L('Скрыть пароль', 'Hide password') : L('Показать пароль', 'Show password'));
    return;
  }
  if (get('[data-logout]')) { await logout(); return; }
  if (get('[data-close]')) { $('#dlg').close(); render(); return; }
  if (get('[data-nav]')) { S.page = get('[data-nav]').dataset.nav; render(); return; }
  if (get('.tab')) { S.meal = get('.tab').dataset.m; render(); return; }
  if (get('[data-tag]')) {
    const id = get('[data-tag]').dataset.tag;
    S.tags.has(id) ? S.tags.delete(id) : S.tags.add(id);
    render(); return;
  }
  if (get('[data-pickbtn]')) { S.showPick = !S.showPick; render(); return; }
  if (get('[data-pickreset]')) { S.pick.clear(); render(); return; }
  if (get('[data-base]')) { if (S.page !== 'base' && S.page !== 'journal') S.baseFrom = S.page; S.showPick = false; S.page = 'base'; render(); return; }
  if (get('[data-journal]')) { if (S.page !== 'base' && S.page !== 'journal') S.baseFrom = S.page; S.showPick = false; S.page = 'journal'; await openJournal(); return; }
  if (get('[data-cat]')) {
    const c = get('[data-cat]').dataset.cat;
    S.openCats.has(c) ? S.openCats.delete(c) : S.openCats.add(c);
    render(); return;
  }
  if (get('[data-pick]')) {
    const id = get('[data-pick]').dataset.pick;
    S.pick.has(id) ? S.pick.delete(id) : S.pick.add(id);
    render(); return;
  }
  const more = get('[data-more]'), less = get('[data-less]');
  if (more || less) {
    const rid = (more || less).dataset.more || (more || less).dataset.less;
    more ? addOne(rid) : removeOne(rid);
    render();
    const w = get('dialog .addwrap'); // кнопка внутри окна рецепта: обновляем её вид
    if (w) w.outerHTML = addBtn(recipe(rid));
    return;
  }
  if (get('[data-slot]')) { openSlot(get('[data-slot]').dataset.slot); return; }
  if (get('[data-setslot]')) { const b = get('[data-setslot]'); setSlot(b.dataset.setslot, b.dataset.pickrid); $('#dlg').close(); render(); return; }
  if (get('[data-clearslot]')) { setSlot(get('[data-clearslot]').dataset.clearslot, null); $('#dlg').close(); render(); return; }
  if (get('[data-names]')) { openNames(); return; }
  if (get('[data-addname]')) { await addName(); return; }
  if (get('[data-delname]')) {
    const n = get('[data-delname]').dataset.delname;
    await db.deletePerson(n);
    S.people = S.people.filter((p) => p.name !== n);
    if (S.name === n) S.name = '';
    fillNames(); render(); return;
  }
  if (get('[data-person]')) { S.name = get('[data-person]').dataset.person; render(); return; }
  if (get('[data-clearmy]')) { if (confirm(L('Очистить весь рацион?', 'Clear all of my menu?'))) { S.my = []; render(); } return; }
  if (get('[data-rmphoto]')) { S.formPhoto = ''; S.formPhotoBlob = null; S.photoChanged = true; $('#f-prev').innerHTML = `<span>${L('Нет фото', 'No photo')}</span>`; return; }
  if (get('[data-editrec]')) {
    const id = get('[data-editrec]').dataset.editrec;
    if ($('#dlg').open) $('#dlg').close();
    openForm(id); return;
  }
  if (get('[data-delrec]')) {
    const id = get('[data-delrec]').dataset.delrec;
    if (confirm(L(`Удалить рецепт «${recipe(id).title}»?`, `Delete recipe "${recipe(id).title}"?`))) {
      db.getPhoto(id).then((photo) => db.removeStoredPhoto(photo)); // подтягиваем фото отдельно, в списке блюд его нет
      await db.deleteRecipe(id);
      S.recipes = S.recipes.filter((r) => r.id !== id);
      S.my = S.my.filter((x) => x.rid !== id);
      if ($('#dlg').open) $('#dlg').close();
      render();
    }
    return;
  }
  if (get('[data-send]')) { await sendMenu(); return; }
  if (get('[data-edit]')) {
    const w = S.wishes.find((x) => x.person === get('[data-edit]').dataset.edit);
    S.name = w.person;
    S.my = valid(w.items).filter((x) => x.slot).map((x) => ({ rid: x.rid, slot: x.slot }));
    S.page = 'my'; render(); return;
  }
  if (get('[data-del]')) {
    const p = get('[data-del]').dataset.del;
    if (confirm(L(`Удалить карточку «${p}»?`, `Delete "${p}"'s card?`))) { await db.deleteWish(p); S.wishes = await db.getWishes(); render(); }
    return;
  }
  if (get('[data-newweek]')) {
    if (confirm(L('Текущая неделя сохранится в журнале, а карточки очистятся. Продолжить?', 'The current week will be saved to the log and the cards cleared. Continue?'))) {
      await db.newWeek(); S.wishes = []; S.done.clear(); S.priceOv = {}; S.journal = null; render();
    }
    return;
  }
  if (get('[data-newing]')) { // новый продукт в базу
    const name = $('#ni-name').value.trim();
    if (!name) return alert(L('Введите название продукта.', 'Enter the product name.'));
    if (ingByName(name)) return alert(L('Такой продукт уже есть.', 'This product already exists.'));
    const price = $('#ni-price').value === '' ? null : Math.max(0, +$('#ni-price').value);
    const ing = await db.addIngredient({ name, unit: 'г', category: $('#ni-cat').value, kcal: Math.max(0, +$('#ni-kcal').value || 0), price });
    S.ings.push(ing); fillDatalist(); viewBase(); return;
  }
  if (get('[data-bdel]')) { // удаление продукта из базы
    const id = get('[data-bdel]').dataset.bdel, ing = ingById(id);
    const used = S.recipes.filter((r) => r.items.some((it) => it.ingredient_id === id)).length;
    if (!confirm(used ? L(`Продукт «${ing.name}» есть в блюдах: ${used}. Удалить его и из этих блюд?`, `"${ing.name}" is used in ${used} dishes. Delete it from them too?`)
      : L(`Удалить продукт «${ing.name}»?`, `Delete product "${ing.name}"?`))) return;
    await db.deleteIngredient(id);
    S.ings = S.ings.filter((i) => i.id !== id);
    S.recipes = await db.getRecipes();
    S.pick.delete(id); delete S.priceOv[id];
    fillDatalist(); persist(); viewBase(); return;
  }
  if (get('[data-reseed]')) { // вернуть стартовые цены и калории
    if (!confirm(L('Цены и калории стартовых продуктов вернутся к значениям по умолчанию. Ваши правки у этих продуктов пропадут (свои продукты не тронем). Продолжить?',
      'Prices and calories of the default products will reset to their original values. Your edits to those products will be lost (your own products are untouched). Continue?'))) return;
    await db.resetToSeed();
    S.ings = await db.getIngredients();
    viewBase(); return;
  }
  if (get('[data-delrow]')) { get('.ing-row').remove(); formKcal(); return; }
  if (t.id === 'btn-add') { openForm(null); return; }
  if (t.id === 'add-row') { $('#ing-rows').insertAdjacentHTML('beforeend', ingRow()); return; }
  if (t.id === 'save-recipe') { await saveRecipe(); return; }
  if (get('[data-card]')) openRecipe(get('[data-card]').dataset.card);
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.done) {
    t.checked ? S.done.add(t.dataset.done) : S.done.delete(t.dataset.done);
    t.closest('.shop-item').classList.toggle('done', t.checked);
    persist();
  }
  if (t.dataset.price) { // правка цены в смете: действует только здесь, базу не меняет
    if (t.value === '') delete S.priceOv[t.dataset.price]; else S.priceOv[t.dataset.price] = Math.max(0, +t.value);
    persist();
    viewShop();
  }
  if (t.dataset.disc) { // скидка для человека: приготовление и расходники
    await db.setDiscount(t.dataset.disc, +t.value);
    const p = S.people.find((x) => x.name === t.dataset.disc);
    if (p) p.discount = +t.value;
    render();
  }
  const bid = t.dataset.bname || t.dataset.bprice || t.dataset.bkcal;
  if (bid) { // правка базы продуктов: сохраняется для комнаты
    const ing = ingById(bid);
    let patch;
    if (t.dataset.bname) {
      const name = t.value.trim();
      const dup = ingByName(name);
      if (!name || (dup && dup.id !== bid)) { alert(!name ? L('Название не может быть пустым.', 'Name cannot be empty.') : L('Такой продукт уже есть.', 'This product already exists.')); t.value = ing.name; return; }
      patch = { name };
    } else if (t.dataset.bprice) patch = { price: t.value === '' ? null : Math.max(0, +t.value) };
    else patch = { kcal: Math.max(0, +t.value || 0) };
    await db.updateIngredient(bid, patch);
    Object.assign(ing, patch);
    if (patch.name) fillDatalist();
  }
  if (t.id === 'sup-in') { // цена расходников за порцию
    S.settings.supplies = Math.max(0, +t.value || 0);
    await db.saveSettings(S.settings);
  }
  if (['cook1-in', 'cook2-in', 'cook3-in'].includes(t.id)) { // своя оплата приготовления на каждый уровень сложности, шаг 0,25
    const key = 'cook_k' + t.id[4];
    S.settings[key] = Math.max(0, Math.round((+t.value || 0) / 0.25) * 0.25);
    t.value = S.settings[key];
    await db.saveSettings(S.settings);
  }
  if (t.id === 'cur-sel') { // смена валюты, при желании с пересчётом цен по курсу
    const old = S.settings.currency, nw = t.value;
    const ans = prompt(L(`Пересчитать цены по курсу? Сколько ${CUR[nw][0]} в 1 ${CUR[old][0]}?\nОставьте пустым, чтобы поменять только символ валюты, цены останутся прежними.`,
      `Convert prices using a rate? How many ${CUR[nw][0]} per 1 ${CUR[old][0]}?\nLeave empty to change only the currency symbol; prices stay the same.`));
    if (ans === null) { t.value = old; return; }
    const rate = parseFloat(ans.replace(',', '.')) || 1;
    await db.changeCurrency(nw, rate);
    S.settings = await db.getSettings();
    S.ings = await db.getIngredients();
    Object.keys(S.priceOv).forEach((id) => { if (rate > 0 && rate !== 1) S.priceOv[id] = Math.round(S.priceOv[id] * rate * 100) / 100; });
    persist();
    viewBase();
  }
  if (t.id === 'f-photo' && t.files[0]) { // фото: уменьшаем, показываем превью, грузим в облако при сохранении
    const { dataUrl, blob } = await readPhoto(t.files[0]);
    S.formPhoto = dataUrl; S.formPhotoBlob = blob; S.photoChanged = true;
    $('#f-prev').innerHTML = `<img src="${dataUrl}" alt="">`;
  }
  if (t.classList.contains('name')) { // известный продукт: единица подставляется сама; новый: просим категорию и калории
    const row = t.closest('.ing-row');
    const ing = ingByName(t.value);
    row.querySelector('.u').textContent = ing ? ing.unit : 'г';
    row.querySelector('.extra').hidden = !!ing || !t.value.trim();
    formKcal();
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; renderGrid(); }
  if (t.id === 'base-q') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.base tr[data-name]').forEach((tr) => { tr.hidden = !tr.dataset.name.includes(q); });
  }
  if (t.id === 'slot-q') { // поиск в окне выбора блюда
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.pick-row').forEach((b) => { b.hidden = !b.textContent.toLowerCase().includes(q); });
  }
  if (t.closest('.ing-row')) formKcal();
});

// Колёсико мыши в числовых полях: шаг 50 (цены, граммы), 0,25 для коэффициента повара, 1 для порций и штучных продуктов
const stepFor = (t) => {
  if (['cook1-in', 'cook2-in', 'cook3-in'].includes(t.id)) return 0.25;
  if (t.classList.contains('amt')) { const row = t.closest('.ing-row'); return row && row.querySelector('.u').textContent === 'шт' ? 1 : 50; }
  const id = t.dataset.price || t.dataset.bprice || t.dataset.bkcal;
  const ing = id && ingById(id);
  return ing && ing.unit === 'шт' ? 1 : 50;
};
document.addEventListener('wheel', (e) => {
  const t = e.target;
  if (t.tagName !== 'INPUT' || t.type !== 'number' || document.activeElement !== t) return;
  e.preventDefault();
  const step = stepFor(t), min = t.min === '' ? -Infinity : +t.min, max = t.max === '' ? Infinity : +t.max;
  t.value = Math.min(max, Math.max(min, (parseFloat(t.value) || 0) + (e.deltaY < 0 ? 1 : -1) * step));
  t.dispatchEvent(new Event('input', { bubbles: true }));
  clearTimeout(t._wt);
  t._wt = setTimeout(() => t.dispatchEvent(new Event('change', { bubbles: true })), 500); // сохраняем, когда крутить перестали
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (['a-login', 'a-pass', 'a-pass2'].includes(e.target.id)) authGo();
  if (e.target.id === 'n-new') addName();
});

/* ---------- Туториал: как пользоваться ---------- */
function tutorialHtml() {
  const step = (n, title, text) => `<div class="tut-step"><span class="tut-circle">${n}</span>
    <h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  return `<div class="tut-card">
    <button class="x tut-close" data-tut-close aria-label="${L('Закрыть', 'Close')}">×</button>
    <h2>${L('Как пользоваться', 'How it works')}</h2>
    <div class="tut-gif"><img src="tutorial.gif" alt="" onerror="this.closest('.tut-gif').classList.add('empty')"></div>
    <div class="tut-steps">
      ${step(1, L('Выбирайте блюда', 'Pick dishes'),
        L('На странице «Блюда» нажимайте «+ Добавить» — блюдо само встанет в свободный слот.', 'On the "Dishes" page, press "+ Add" — the dish fills a free slot by itself.'))}
      ${step(2, L('Переставляйте в «Рационе»', 'Rearrange in "Diet"'),
        L('Не понравилось место? Перетащите блюдо мышью на другой слот — они поменяются местами.', 'Don\'t like the spot? Drag a dish onto another slot — they swap places.'))}
      ${step(3, L('Отправьте — и готово', 'Send it — done'),
        L('Нажмите «Отправить в меню недели»: список покупок и стоимость посчитаются сами.', 'Press "Send to weekly menu": the shopping list and cost are calculated automatically.'))}
    </div>
    <button class="btn primary" data-tut-close>${L('Понятно, начнём', 'Got it, let\'s start')}</button>
  </div>`;
}
function openTutorial() { $('#tutorial').innerHTML = tutorialHtml(); $('#tutorial').hidden = false; }
function closeTutorial() { $('#tutorial').hidden = true; }

/* ---------- Старт ---------- */
initChrome();
(async () => {
  try {
    S.room = await db.restore();
    if (S.room) await enterRoom(); else render();
  } catch (err) {
    $('#view').innerHTML = `<p class="empty">${L('Не удалось загрузить данные', 'Failed to load data')}: ${esc(err.message || err)}</p>`;
  }
})();

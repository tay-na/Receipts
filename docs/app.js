import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://rkudzeirgdnegfmkbjqo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0eL4OloeLKoZviRruDCYPw_QYiNizF4'; // публичный ключ, доступ закрыт правилами базы

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: false } });
const app = document.getElementById('app');

// ---------- утилиты ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => n == null ? '' : String(+(+n).toFixed(2)).replace('.', ',');
const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const SRC = { instagram: 'Instagram', telegram: 'Телеграм', site: 'Сайт', book: 'Книга', magazine: 'Журнал', pdf: 'PDF', own: 'Свой', other: 'Пост из чата', app: 'Приложение', friend: 'От друзей' };
const LANG = { en: 'перевод с английского', sr: 'перевод с сербского' };
const ui = { q: sessionStorageGet('q') || '', filter: sessionStorageGet('f') || 'all' };
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { } }

let recipes = null; // кэш списка
const cover = r => (r.recipe_media || []).sort((a, b) => a.position - b.position).find(m => m.kind !== 'pdf')?.path;

// ---------- роутинг ----------
window.addEventListener('hashchange', route);
route();

async function route() {
  const h = location.hash.slice(1) || '/';
  const shared = h.match(/^\/s\/([\w-]+)/);
  if (shared) return showShared(shared[1]);

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();

  const rec = h.match(/^\/r\/([\w-]+)/);
  if (rec) return showRecipe(rec[1]);
  return showList();
}

// ---------- вход по почте и паролю (пользователей создаём в Supabase → Authentication → Users) ----------
function showLogin(email = '', error = '') {
  app.innerHTML = `
  <form class="login" id="f">
    <h1>Рецепты</h1>
    <input type="email" name="email" required autocomplete="username" placeholder="почта" value="${esc(email)}">
    <input type="password" name="password" required autocomplete="current-password" placeholder="пароль">
    <button class="btn main">Войти</button>
    <div class="err">${esc(error)}</div>
  </form>`;
  const f = app.querySelector('#f');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    f.querySelector('.main').disabled = true;
    const em = f.email.value.trim();
    const { error } = await sb.auth.signInWithPassword({ email: em, password: f.password.value });
    error ? showLogin(em, humanError(error)) : (location.hash = '#/', route());
  });
}
function humanError(e) {
  const m = e?.message || String(e);
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток. Подожди пару минут.';
  if (/invalid login|credentials/i.test(m)) return 'Неверная почта или пароль.';
  return m;
}

// ---------- список и поиск ----------
async function loadRecipes(force = false) {
  if (recipes && !force) return recipes;
  const { data, error } = await sb.from('recipes')
    .select('id,kind,title,status,rating,source_type,source_author,tags,recipe_ingredients(name),recipe_media(path,kind,position)')
    .order('title');
  if (error) throw error;
  recipes = data;
  return data;
}

async function showList() {
  app.innerHTML = `<p class="muted center">Загрузка…</p>`;
  let list;
  try { list = await loadRecipes(); } catch (e) { return showError(e); }
  if (!list.length) {
    const { data: houses } = await sb.from('households').select('id');
    if (!houses?.length) return showNoHouse();
  }
  app.innerHTML = `
    <div class="top">
      <input class="search" id="q" type="search" placeholder="Блюдо или продукты" value="${esc(ui.q)}" autocomplete="off">
      <div class="chips" id="chips">
        ${[['all', 'Все'], ['cooked', 'Готовила'], ['want', 'Хочу попробовать'], ['idea', 'Идеи']]
          .map(([k, t]) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="count" id="count"></div>
    <div class="list" id="list"></div>
    <div class="foot"><button id="out">Выйти</button></div>`;
  const q = app.querySelector('#q');
  q.addEventListener('input', () => { ui.q = q.value; sessionStorageSet('q', ui.q); draw(); });
  app.querySelector('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    ui.filter = b.dataset.f; sessionStorageSet('f', ui.filter);
    app.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); draw();
  });
  app.querySelector('#out').addEventListener('click', async () => { await sb.auth.signOut(); recipes = null; showLogin(); });
  draw();

  function draw() {
    const words = norm(ui.q).split(/[\s,]+/).filter(Boolean);
    const out = [];
    for (const r of list) {
      if (ui.filter === 'idea' && r.kind !== 'idea') continue;
      if (ui.filter === 'cooked' && r.status !== 'cooked') continue;
      if (ui.filter === 'want' && (r.status !== 'want' || r.kind === 'idea')) continue;
      const title = norm(r.title);
      const ings = r.recipe_ingredients.map(i => i.name);
      const hits = [];
      let ok = true;
      for (const w of words) {
        if (title.includes(w)) continue;
        const found = ings.find(n => norm(n).includes(w));
        if (found) { if (!hits.includes(found)) hits.push(found); } else { ok = false; break; }
      }
      if (ok) out.push({ r, hits });
    }
    app.querySelector('#count').textContent = words.length || ui.filter !== 'all'
      ? `Найдено: ${out.length}` : `Всего рецептов: ${out.length}`;
    app.querySelector('#list').innerHTML = out.map(({ r, hits }) => `
      <a class="row${cover(r) ? ' has-thumb' : ''}" href="#/r/${r.id}">
        ${cover(r) ? `<img class="thumb" src="${esc(cover(r).replace('.webp', '-t.webp'))}" alt="" loading="lazy">` : ''}
        <div class="rt"><b>${esc(r.title)}${r.kind === 'idea' ? '<span class="badge idea">идея</span>' : ''}${r.status === 'cooked' ? '<span class="badge cooked">готовила</span>' : ''}</b>
        <div class="sub">${esc([SRC[r.source_type], r.source_author].filter(Boolean).join(' · '))}${r.rating ? ' · ' + '★'.repeat(r.rating) : ''}</div>
        ${hits.length ? `<div class="hit">есть: ${hits.map(h => `<mark>${esc(h)}</mark>`).join(', ')}</div>` : ''}
      </div></a>`).join('') || `<p class="muted center">Ничего не нашлось</p>`;
  }
}

function showNoHouse() {
  app.innerHTML = `<div class="login"><h1>Почти готово</h1>
    <p>Вход выполнен, но эта почта ещё не добавлена в «Наш дом». Выполни в Supabase → SQL Editor файл <b>supabase/add_member.sql</b> с этой почтой и обнови страницу.</p>
    <button class="btn" onclick="location.reload()">Обновить</button></div>`;
}
function showError(e) {
  app.innerHTML = `<div class="login"><h1>Ошибка</h1><p class="err">${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">Обновить</button></div>`;
}

// ---------- карточка ----------
async function fetchFull(id) {
  const { data, error } = await sb.from('recipes')
    .select('*, recipe_ingredients(*), recipe_steps(*), recipe_media(*)').eq('id', id).single();
  if (error) throw error;
  data.ingredients = data.recipe_ingredients.sort((a, b) => a.position - b.position);
  data.steps = data.recipe_steps.sort((a, b) => a.position - b.position);
  data.media = (data.recipe_media || []).filter(m => m.kind !== 'pdf').sort((a, b) => a.position - b.position);
  return data;
}

function renderRecipe(r) {
  const meta = [SRC[r.source_type], r.source_author, r.source_ref, LANG[r.original_lang]].filter(Boolean).map(esc);
  if (r.source_url) meta.push(`<a href="${esc(r.source_url)}" target="_blank" rel="noopener">источник</a>`);
  const y = [];
  if (r.yield_amount) y.push(`${num(r.yield_amount)} ${esc(r.yield_unit || '')}`);
  if (r.time_min) y.push(`${r.time_min} мин`);
  const pics = r.media || [];
  const head = `
    <h2>${esc(r.title)}${r.kind === 'idea' ? '<span class="badge idea">идея</span>' : ''}</h2>
    <div class="meta">${[...meta, ...y].join(' · ')}</div>
    ${r.summary ? `<p class="sum">${esc(r.summary)}</p>` : ''}`;
  return `
    ${pics.length ? `<div class="head"><div>${head}</div>
      <button class="cover" data-gallery="0"><img src="${esc(pics[0].path)}" alt="">${pics.length > 1 ? `<span class="more">+${pics.length - 1}</span>` : ''}</button></div>` : head}
    <h3>${r.kind === 'idea' ? 'Что понадобится' : 'Ингредиенты'}</h3>
    ${renderIngredients(r)}
    ${r.steps.length ? `<h3>Как готовить</h3>${renderSteps(r.steps)}` : ''}`;
}

function qty(i) {
  let q = num(i.amount) + (i.amount_max ? '–' + num(i.amount_max) : '');
  q = (q + ' ' + (i.unit || '')).trim();
  return esc(q) + (i.grams ? ` <span class="g">≈ ${num(i.grams)} г</span>` : '');
}

function renderIngredients(r) {
  const sections = [];
  for (const i of r.ingredients) {
    let s = sections.find(x => x.name === i.section);
    if (!s) sections.push(s = { name: i.section, groups: [] });
    const last = s.groups.at(-1);
    if (i.alt_group != null && last && last[0].alt_group === i.alt_group) last.push(i); else s.groups.push([i]);
  }
  return sections.map(s => `${s.name ? `<h4>${esc(s.name)}</h4>` : ''}<ul class="ing">${s.groups.map(g => {
    const qs = g.map(qty), same = qs.every(x => x === qs[0]);
    const names = g.map((i, k) =>
      `<span>${esc(i.name)}</span>${same ? '' : ` <span class="q2">${qs[k]}</span>`}` +
      (i.optional && k === 0 ? '<span class="t">по желанию</span>' : '') +
      (i.note ? `<div class="n">${esc(i.note)}</div>` : '') +
      (i.raw && r.original_lang !== 'ru' ? `<div class="n">ориг.: ${esc(i.raw)}</div>` : ''));
    return `<li><div>${names.join('<div class="or">или</div>')}</div><div class="q">${same ? qs[0] : ''}</div></li>`;
  }).join('')}</ul>`).join('');
}

function renderSteps(steps) {
  let html = '', cur, open = false;
  for (const s of steps) {
    if (s.section !== cur) {
      if (open) html += '</ol>';
      if (s.section) html += `<h4>${esc(s.section)}</h4>`;
      html += '<ol class="steps">'; open = true; cur = s.section;
    }
    html += `<li>${esc(s.text)}</li>`;
  }
  return html + (open ? '</ol>' : '');
}

async function showRecipe(id) {
  app.innerHTML = `<p class="muted center">Загрузка…</p>`;
  let r;
  try { r = await fetchFull(id); } catch (e) { return showError(e); }
  galleryPics = r.media;
  window.scrollTo(0, 0);
  app.innerHTML = `
    <div class="bar"><button class="back" id="back">← Все рецепты</button></div>
    <article class="card">${renderRecipe(r)}
      <div class="tags">${(r.tags || []).map(t => `<span>#${esc(t)}</span>`).join('')}</div>
    </article>
    <h3>Мои отметки</h3>
    <div class="mine">
      <div class="seg" id="status">
        <button data-s="want" class="${r.status === 'want' ? 'on' : ''}">Хочу попробовать</button>
        <button data-s="cooked" class="${r.status === 'cooked' ? 'on' : ''}">Готовила</button>
      </div>
      <div><div class="lbl">Оценка</div><div class="stars" id="stars">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n <= (r.rating || 0) ? 'on' : ''}" aria-label="${n}">★</button>`).join('')}</div></div>
      <div><div class="lbl">Заметки</div><textarea id="notes" placeholder="Соли меньше, духовка 170…">${esc(r.notes || '')}</textarea><div class="saved" id="saved"></div></div>
      <button class="btn main" id="share">Поделиться рецептом</button>
    </div>`;
  app.querySelector('#back').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
  const saved = app.querySelector('#saved');
  const save = async patch => {
    const { error } = await sb.from('recipes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    saved.textContent = error ? 'Не сохранилось: ' + error.message : 'Сохранено';
    setTimeout(() => saved.textContent = '', 1500);
    if (!error) { Object.assign(r, patch); const c = recipes?.find(x => x.id === id); if (c) Object.assign(c, patch); }
  };
  app.querySelector('#status').onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    app.querySelectorAll('#status button').forEach(x => x.classList.toggle('on', x === b));
    save({ status: b.dataset.s });
    if (b.dataset.s === 'cooked') sb.from('cook_log').insert({ recipe_id: id }).then(() => { });
  };
  app.querySelector('#stars').onclick = e => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    const n = +b.dataset.n === r.rating ? null : +b.dataset.n;
    app.querySelectorAll('#stars button').forEach(x => x.classList.toggle('on', n && +x.dataset.n <= n));
    save({ rating: n });
  };
  app.querySelector('#notes').onblur = e => { if (e.target.value !== (r.notes || '')) save({ notes: e.target.value }); };
  app.querySelector('#share').onclick = async () => {
    let token = r.share_token;
    if (!token) {
      token = crypto.getRandomValues(new Uint32Array(3)).reduce((s, x) => s + x.toString(36), '');
      await save({ share_token: token });
    }
    const url = location.origin + location.pathname + '#/s/' + token;
    if (navigator.share) { try { await navigator.share({ title: r.title, url }); } catch { } }
    else { try { await navigator.clipboard.writeText(url); saved.textContent = 'Ссылка скопирована'; } catch { prompt('Ссылка на рецепт', url); } }
  };
}

// ---------- галерея ----------
let galleryPics = [];
document.addEventListener('click', e => {
  const b = e.target.closest('[data-gallery]'); if (!b) return;
  const g = document.createElement('div'); g.className = 'gallery';
  g.innerHTML = `<div class="gstrip">${galleryPics.map(m => `<img src="${esc(m.path)}" alt="">`).join('')}</div><button class="gclose" aria-label="Закрыть">✕</button>`;
  g.addEventListener('click', ev => { if (ev.target.tagName !== 'IMG') g.remove(); });
  document.body.appendChild(g);
});

// ---------- публичная ссылка (без входа) ----------
async function showShared(token) {
  app.innerHTML = `<p class="muted center">Загрузка…</p>`;
  const { data, error } = await sb.rpc('shared_recipe', { token });
  if (error || !data) {
    app.innerHTML = `<div class="login"><h1>Рецепт не найден</h1><p class="muted">Ссылка устарела или неверная.</p></div>`;
    return;
  }
  const r = { ...data.recipe, ingredients: data.ingredients || [], steps: data.steps || [], media: data.media || [] };
  galleryPics = r.media;
  document.title = r.title;
  app.innerHTML = `<article class="card">${renderRecipe(r)}</article>`;
}

// ---------- офлайн-оболочка ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });

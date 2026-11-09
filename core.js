export const LIMIT = 450000;
export const clone = x => JSON.parse(JSON.stringify(x));
export const uid = () => crypto.randomUUID();
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateClass(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Некорректный класс');
  if (typeof c.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(c.id)) throw Error('Некорректный ID');
  if (!Number.isInteger(c.revision) || c.revision < 0) throw Error('Некорректная версия');
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120) throw Error('Название: от 1 до 120 символов');
  for (const k of ['subtitle','summary','role','hitDie','ability','source','icon']) if (typeof c[k] !== 'string' || c[k].length > 2000) throw Error('Некорректное поле: '+k);
  if (!Array.isArray(c.blocks) || c.blocks.length > 150) throw Error('Максимум 150 блоков');
  const ids = new Set();
  for (const b of c.blocks) {
    if (!b || typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(b.id) || ids.has(b.id)) throw Error('Некорректный ID блока');
    ids.add(b.id);
    if (!['text','feature','callout','subclass','table'].includes(b.type) || typeof b.title !== 'string' || b.title.length > 200) throw Error('Некорректный блок');
    if (b.type === 'table') {
      if (!Array.isArray(b.rows) || b.rows.length < 1 || b.rows.length > 50 || !Array.isArray(b.headers) || b.headers.length < 1 || b.headers.length > 16) throw Error('Таблица: 1–50 строк, 1–16 столбцов');
      if (b.headers.some(x=>typeof x !== 'string' || x.length > 1000) || b.rows.some(r=>!Array.isArray(r) || r.length !== b.headers.length || r.some(x=>typeof x !== 'string' || x.length > 2000))) throw Error('Некорректные ячейки');
    } else if (typeof b.html !== 'string') throw Error('Нет текста блока');
    if (b.type === 'feature' && (!Number.isInteger(b.level) || b.level < 1 || b.level > 20)) throw Error('Уровень умения: 1–20');
  }
  if (JSON.stringify(c).length > LIMIT) throw Error('Класс слишком большой (лимит 450 000 символов)');
  return c;
}

// Никогда не вставляем непроверенный HTML из Drive, импорта или буфера обмена.
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const allowed = new Set(['P','BR','STRONG','B','EM','I','U','S','UL','OL','LI','H2','H3','H4','BLOCKQUOTE','A','HR','SUP','SUB','TABLE','THEAD','TBODY','TR','TH','TD']);
  const discard = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','TEXTAREA','TEMPLATE','IMG','VIDEO','AUDIO']);
  function walk(parent) {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === 8) { node.remove(); continue; }
      if (node.nodeType !== 1) continue;
      if (discard.has(node.tagName)) { node.remove(); continue; }
      walk(node);
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      const href = node.tagName === 'A' ? node.getAttribute('href') : null;
      for (const a of [...node.attributes]) node.removeAttribute(a.name);
      if (href) {
        try { const u = new URL(href, location.href); if (['https:','http:'].includes(u.protocol)) { node.setAttribute('href',u.href); node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); } } catch {}
      }
    }
  }
  walk(doc.body); return doc.body.innerHTML;
}

export function newClass() {
  return { id:uid(), revision:0, name:'Новый класс', subtitle:'', summary:'', role:'Универсал', hitDie:'к8', ability:'', source:'Авторский класс', icon:'✧', blocks:[
    {id:uid(),type:'text',title:'История класса',html:'<p>Расскажи, кто эти герои и какое место они занимают в твоём мире.</p>'},
    {id:uid(),type:'table',title:'Развитие класса',headers:['Уровень','Бонус мастерства','Умения'],rows:Array.from({length:20},(_,i)=>[String(i+1),'+'+(2+Math.floor(i/4)),'—'])},
    {id:uid(),type:'text',title:'Классовые умения',html:'<p><strong>Хиты:</strong> 1к8 за каждый уровень.</p><p><strong>Владения:</strong> доспехи, оружие, инструменты.</p><p><strong>Спасброски:</strong> выбери две характеристики.</p><p><strong>Снаряжение:</strong> стартовое снаряжение класса.</p>'},
    {id:uid(),type:'feature',title:'Первое умение',level:1,html:'<p>Опиши действие, условия применения и восстановление ресурса.</p>'}
  ]};
}

export class RemoteStore {
  constructor(url, token) { this.url=url; this.token=token; }
  async request(action, data={}) {
    if (!this.token()) throw Error('Нет кода доступа. Открой ссылку с #кодом.');
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),35000);
    try {
      const response = await fetch(this.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token:this.token(),action,...data}),redirect:'follow',credentials:'omit',signal:controller.signal});
      if (!response.ok) throw Error('HTTP '+response.status);
      const result = await response.json();
      if (!result.ok) { const err = Error(result.error?.message || 'Ошибка сервера'); err.code=result.error?.code; throw err; }
      return result.data;
    } catch(e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw Error('Нет подтверждения сервера. Проверь соединение и настройки Apps Script. При сохранении повтори запрос той же кнопкой.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  list() { return this.request('list'); }
  get(id) { return this.request('get',{id}); }
  save(value,requestId) { return this.request('save',{value,requestId}); }
}

export class DemoStore {
  constructor(seed) { this.seed=seed; }
  read() { const raw=localStorage.getItem('codex-demo-v1'); return raw ? JSON.parse(raw) : clone(this.seed); }
  async list() { return this.read().map(({blocks,...meta})=>meta); }
  async get(id) { const c=this.read().find(c=>c.id===id); if(!c) throw Error('Класс не найден'); return c; }
  async save(value,requestId) {
    validateClass(value); const all=this.read(); const i=all.findIndex(c=>c.id===value.id); const prev=all[i];
    if (prev?._requestId===requestId) return prev;
    if ((prev?.revision || 0)!==value.revision) { const e=Error('Класс уже изменён. Сохрани JSON-копию и открой актуальную версию.');e.code='CONFLICT';throw e; }
    const result={...clone(value),revision:(prev?.revision || 0)+1,updatedAt:new Date().toISOString(),_requestId:requestId};
    if(i<0)all.push(result);else all[i]=result;
    localStorage.setItem('codex-demo-v1',JSON.stringify(all)); return result;
  }
}

import {clone,uid,escapeHtml as esc,sanitizeHtml,newClass,validateClass,RemoteStore,DemoStore} from './core.js';
import {demoClasses} from './demo.js';

const app=document.querySelector('#app');
const dialog=document.querySelector('#settings');
let store, mode, catalog=[], current=null, editing=false, dirty=false, saving=false, loading=false, pending=null, draftTimer, selection=null, activeRich=null, tocObserver, routeVersion=0;
let apiUrl=localStorage.getItem('codex-api-url') ?? window.CODEX_CONFIG?.apiUrl ?? '';
const token=()=>{try{return decodeURIComponent(location.hash.slice(1));}catch{return '';} };
const draftKey=id=>'codex-draft:'+ (mode==='demo'?'demo':apiUrl) + ':'+id;
const toast=(message)=>{ const el=document.querySelector('#toast'); el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),5000); };
function initStore(){mode=apiUrl?'remote':'demo';store=apiUrl?new RemoteStore(apiUrl,token):new DemoStore(demoClasses);document.querySelector('#connection').innerHTML=mode==='demo'?'<span class="dot"></span> Деморежим · данные сохраняются только в этом браузере <button data-action="settings">Подключить Drive ↗</button>':'<span class="dot online"></span> Google Drive · сохранение по кнопке';}
function urlFor(id,edit=false){const url=new URL(location.href);url.search='';if(id)url.searchParams.set('class',id);if(edit)url.searchParams.set('edit','1');return url.pathname+url.search+url.hash;}
function canLeave(){ if(saving){toast('Дождись ответа на сохранение.');return false;}if(dirty)writeDraft();return !dirty||confirm('Есть несохранённые изменения. Покинуть редактор? Копия черновика останется в этой вкладке.'); }
async function navigate(id=null,edit=false){if(!canLeave())return;clearTimeout(draftTimer);dirty=false;history.pushState(null,'',urlFor(id,edit));await route();}
function setDirty(){dirty=true;document.querySelector('#save-state')?.replaceChildren(document.createTextNode('Есть изменения'));clearTimeout(draftTimer);draftTimer=setTimeout(writeDraft,350);}
function writeDraft(){if(!current||!editing)return;try{sessionStorage.setItem(draftKey(current.id),JSON.stringify(current));}catch{toast('Не удалось сохранить локальный черновик. Скачай JSON-копию.');}}
function draft(id){try{return JSON.parse(sessionStorage.getItem(draftKey(id))||'null');}catch{return null;}}
function errorView(e){app.innerHTML=`<section class="empty"><span class="large-symbol">◇</span><h1>Не удалось загрузить библиотеку</h1><p>${esc(e.message)}</p><button class="primary" data-action="retry">Повторить</button> <button class="secondary" data-action="settings">Подключение</button></section>`;}
async function route(){
  const version=++routeVersion;
  loading=true;app.innerHTML='<div class="empty"><span class="large-symbol pulse">✧</span><p>Открываем кодекс…</p></div>';tocObserver?.disconnect();
  try{
    if(mode==='remote'&&!token()){app.innerHTML='<section class="empty"><span class="large-symbol">◇</span><h1>Нужен код доступа</h1><p>Открой выданную тебе ссылку с кодом после #.</p><button class="secondary" data-action="settings">Подключение</button></section>';return;}
    const params=new URLSearchParams(location.search),id=params.get('class');editing=params.get('edit')==='1';
    if(id){
      const local=draft(id);
      if(local?.revision===0 && editing)current=local;
      else {const loaded=await store.get(id);if(version!==routeVersion)return;current=loaded;}
      validateClass(current);renderClass();
    }else{editing=false;current=null;const loaded=await store.list();if(version!==routeVersion)return;catalog=loaded;renderCatalog();}
  }catch(e){if(version===routeVersion)errorView(e);}finally{if(version===routeVersion)loading=false;}
}
function renderCatalog(){
  app.innerHTML=`<section class="catalog-hero"><div class="eyebrow"><span></span> БИБЛИОТЕКА ПРИКЛЮЧЕНИЙ</div><h1>У каждой легенды<br>свой <em>класс.</em></h1><p>Место для героев, которых ещё нет в книгах.<br>Создавай классы и собирай правила своего мира.</p><button class="primary" data-action="new">＋ Создать класс</button><div class="hero-sigil" aria-hidden="true"><span>✧</span><i>ᚱ</i><b>✦</b></div></section>
  <section class="library"><div class="library-heading"><div><div class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</div><h2>Авторские классы <span class="count">${catalog.length}</span></h2></div><button class="text-button" data-action="refresh">↻ Обновить</button></div><div class="filters"><label class="search"><span>⌕</span><input id="search" placeholder="Найти класс или источник…" aria-label="Поиск классов"></label><select id="role-filter" aria-label="Роль"><option value="">Все роли</option>${[...new Set(catalog.map(c=>c.role))].filter(Boolean).map(r=>`<option>${esc(r)}</option>`).join('')}</select><label class="import-button secondary">↑ Импорт JSON<input type="file" id="import" accept="application/json,.json" hidden></label></div><div id="cards" class="cards"></div><p class="library-note">✧ &nbsp; Каждый великий герой когда-то был идеей на полях.</p></section>`;
  document.querySelector('#search').addEventListener('input',renderCards);document.querySelector('#role-filter').addEventListener('change',renderCards);renderCards();
}
function renderCards(){
  const q=document.querySelector('#search').value.toLowerCase(),role=document.querySelector('#role-filter').value;
  const items=catalog.filter(c=>(!role||c.role===role)&&[c.name,c.subtitle,c.summary,c.source].join(' ').toLowerCase().includes(q));
  document.querySelector('#cards').innerHTML=items.length?items.map((c,i)=>`<a href="${esc(urlFor(c.id))}" data-open="${esc(c.id)}" class="class-card tone-${i%3}"><div class="card-top"><span class="tag">${esc(c.role)}</span><span class="card-index">${String(catalog.indexOf(c)+1).padStart(2,'0')}</span></div><div class="card-symbol" aria-hidden="true">${esc(c.icon)}</div><h3>${esc(c.name)}</h3><div class="english">${esc(c.subtitle || 'Авторский класс')}</div><p>${esc(c.summary || 'История этого класса ещё не написана.')}</p><div class="card-stats"><span>КОСТЬ ХИТОВ <b>${esc(c.hitDie)}</b></span><span class="card-arrow">↗</span></div><div class="card-source">${esc(c.source)}</div></a>`).join(''):'<div class="empty small"><h3>Пока пусто</h3><p>Создай первый класс или измени условия поиска.</p></div>';
}
const field=(label,key,value,wide=false)=>`<label class="${wide?'wide':''}">${label}<input data-field="${key}" value="${esc(value)}" maxlength="${key==='name'?120:2000}"></label>`;
function richBlock(b){
  if(b.type==='table')return `<div class="table-scroll"><table class="progression"><thead><tr>${b.headers.map((h,i)=>`<th ${editing?`contenteditable="true" data-cell="header:${i}" spellcheck="false"`:''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r,ri)=>`<tr>${r.map((v,ci)=>`<td ${editing?`contenteditable="true" data-cell="${ri}:${ci}" spellcheck="false"`:''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${editing?'<div class="table-actions"><button data-block-action="row-add">＋ Строка</button><button data-block-action="row-remove">− Строка</button><button data-block-action="col-add">＋ Столбец</button><button data-block-action="col-remove">− Столбец</button><span>Первая строка — заголовки. Последние строка / столбец удаляются с подтверждением.</span></div>':''}`;
  return `<div class="rich-content" ${editing?'contenteditable="true" data-rich spellcheck="true" role="textbox" aria-multiline="true" aria-label="Текст блока"':''}>${sanitizeHtml(b.html)}</div>`;
}
function blockView(b,index){
  const title=editing?`<input class="block-title" data-block-field="title" value="${esc(b.title)}" maxlength="200" aria-label="Заголовок блока">`:`<h2>${esc(b.title)}</h2>`;
  const level=b.type==='feature'?editing?`<label class="level-input">Уровень <input type="number" min="1" max="20" value="${b.level}" data-block-field="level"></label>`:`<span class="level-label">${b.level} УРОВЕНЬ</span>`:'';
  if(!editing&&b.type==='subclass')return `<details class="content-block subclass" id="section-${esc(b.id)}"><summary>${esc(b.title)}<span>＋</span></summary>${richBlock(b)}</details>`;
  return `<section id="section-${esc(b.id)}" class="content-block ${esc(b.type)} ${editing?'editable-block':''}" data-block="${esc(b.id)}">${editing?`<div class="block-controls"><span>${({text:'Текст',feature:'Умение',table:'Таблица',callout:'Врезка',subclass:'Подкласс'})[b.type]} · ${index+1}</span><div><button data-block-action="up" aria-label="Выше" ${index===0?'disabled':''}>↑</button><button data-block-action="down" aria-label="Ниже" ${index===current.blocks.length-1?'disabled':''}>↓</button><button data-block-action="duplicate" aria-label="Копия">⧉</button><button data-block-action="remove" aria-label="Удалить блок">×</button></div></div>`:''}${level}${title}${richBlock(b)}</section>`;
}
function renderClass(){
  const c=current; const local=draft(c.id);
  app.innerHTML=`<div class="class-nav"><button class="text-button" data-action="catalog">← Все классы</button><div>${editing?`<span id="save-state" class="muted">${dirty?'Есть изменения':'Редактор'}</span><button class="secondary" data-action="view">Читать</button><button class="primary" id="save" data-action="save">Сохранить ${mode==='demo'?'локально':'в Drive'}</button>`:`<button class="secondary" data-action="export">↓ JSON</button><button class="secondary" data-action="print">Печать</button><button class="primary" data-action="edit">✎ Редактировать</button>`}</div></div>
  ${editing?`<div class="editor-notice">РЕЖИМ РЕДАКТОРА <span>Нажми на текст, чтобы изменить его. Изменения отправляются ${mode==='demo'?'в хранилище браузера':'в Drive'} только по кнопке.</span></div>`:''}
  ${editing&&!dirty&&local&&JSON.stringify(local)!==JSON.stringify(c)?'<div class="draft-notice">В этой вкладке есть локальный черновик. <button data-action="restore">Восстановить</button><button data-action="discard-draft">Удалить черновик</button></div>':''}
  <div class="class-layout"><aside class="toc"><div class="eyebrow">НА ЭТОЙ СТРАНИЦЕ</div><a href="#" data-top>Обзор класса</a>${c.blocks.map(b=>`<a href="#section-${esc(b.id)}" data-section="${esc(b.id)}">${esc(b.title||'Без заголовка')}</a>`).join('')}<div class="toc-bottom"><span>✧</span><p>${esc(c.source)}</p><small>${c.revision?'Версия '+c.revision:'Новый класс'}</small></div></aside>
  <article class="class-document"><header class="class-header"><div class="eyebrow">АВТОРСКИЙ КЛАСС <span> / ${esc(c.role)}</span></div><div class="class-heading"><div><h1>${esc(c.name)}</h1><p class="english">${esc(c.subtitle)}</p></div><span class="class-seal">${esc(c.icon)}</span></div><p class="lead">${esc(c.summary)}</p><div class="stats"><div><small>КОСТЬ ХИТОВ</small><strong>${esc(c.hitDie)}</strong></div><div><small>ХАРАКТЕРИСТИКИ</small><strong>${esc(c.ability||'Не указаны')}</strong></div><div><small>ИСТОЧНИК</small><strong>${esc(c.source)}</strong></div></div></header>
  ${editing?`<section class="meta-editor"><h3>Карточка класса</h3><div class="meta-grid">${field('Название','name',c.name)}${field('Название на английском','subtitle',c.subtitle)}${field('Роль','role',c.role)}${field('Кость хитов','hitDie',c.hitDie)}${field('Основные характеристики','ability',c.ability)}${field('Источник / сборник','source',c.source)}${field('Символ карточки','icon',c.icon)}<label class="wide">Краткое описание<textarea data-field="summary" maxlength="2000">${esc(c.summary)}</textarea></label></div></section>
  <div class="editor-toolbar" role="toolbar" aria-label="Форматирование"><button data-format="bold" title="Жирный"><b>Ж</b></button><button data-format="italic" title="Курсив"><i>К</i></button><button data-format="underline" title="Подчёркивание"><u>Ч</u></button><span></span><button data-format="formatBlock" data-value="p">Текст</button><button data-format="formatBlock" data-value="h3">H3</button><button data-format="formatBlock" data-value="h4">H4</button><button data-format="formatBlock" data-value="blockquote">❞</button><span></span><button data-format="insertUnorderedList" title="Список">• Список</button><button data-format="insertOrderedList" title="Нумерованный список">1. Список</button><button data-format="link">Ссылка</button><button data-format="removeFormat" title="Очистить формат">Tx</button><button data-format="undo" title="Отменить ввод">↶</button><button data-format="redo" title="Повторить ввод">↷</button></div>`:''}
  <div id="blocks">${c.blocks.map(blockView).join('')}</div>
  ${editing?'<div class="add-block"><span>Добавить блок</span><button data-add="text">＋ Текст</button><button data-add="feature">＋ Умение</button><button data-add="table">＋ Таблица</button><button data-add="callout">＋ Врезка</button><button data-add="subclass">＋ Подкласс</button></div><div class="editor-bottom"><button class="secondary" data-action="export">↓ Скачать JSON-копию</button><span class="muted">Черновик хранится в текущей вкладке</span></div>':''}</article></div>`;
  selection=null;activeRich=null;
}
function syncRich(el){const block=current.blocks.find(b=>b.id===el.closest('[data-block]').dataset.block);if(block){block.html=sanitizeHtml(el.innerHTML);setDirty();}}
function normalized(){const c=clone(current);c.name=c.name.trim();for(const b of c.blocks)if(b.type!=='table')b.html=sanitizeHtml(b.html);validateClass(c);return c;}
async function save(){
  if(saving)return;
  let value;try{value=normalized();}catch(e){toast(e.message);return;}
  const signature=JSON.stringify(value);if(!pending||pending.signature!==signature)pending={signature,requestId:uid()};
  saving=true; const button=document.querySelector('#save');button.disabled=true;button.textContent='Сохраняем…';
  // Замораживаем поля, чтобы поздний ответ сервера не затёр новый ввод.
  app.inert=true;
  try{const result=await store.save(value,pending.requestId);validateClass(result);current=result;dirty=false;pending=null;clearTimeout(draftTimer);sessionStorage.removeItem(draftKey(current.id));renderClass();toast(mode==='demo'?'Сохранено в этом браузере':'Изменения сохранены в Google Drive');}
  catch(e){toast(e.message);if(e.code==='CONFLICT'){document.querySelector('#save-state').textContent='Конфликт версий · скачай JSON-копию';}button.disabled=false;button.textContent='Повторить сохранение';}
  finally{saving=false;app.inert=false;}
}
function addBlock(type){
  const block={id:uid(),type,title:({text:'Новый раздел',feature:'Новое умение',table:'Новая таблица',callout:'Заметка',subclass:'Новый подкласс'})[type]};
  if(type==='table'){block.headers=['Параметр','Значение'];block.rows=[['',''],['','']];}else block.html='<p>Текст блока…</p>';
  if(type==='feature')block.level=1;
  current.blocks.push(block);setDirty();renderClass();document.querySelector('#section-'+block.id).scrollIntoView({behavior:'smooth',block:'center'});
}
function blockAction(action,el){
  const section=el.closest('[data-block]'),index=current.blocks.findIndex(b=>b.id===section.dataset.block),b=current.blocks[index];
  if(action==='remove'){if(!confirm('Удалить этот блок?'))return;current.blocks.splice(index,1);}
  if(action==='duplicate')current.blocks.splice(index+1,0,{...clone(b),id:uid()});
  if(action==='up'&&index>0)[current.blocks[index-1],current.blocks[index]]=[b,current.blocks[index-1]];
  if(action==='down'&&index<current.blocks.length-1)[current.blocks[index+1],current.blocks[index]]=[b,current.blocks[index+1]];
  if(action==='row-add'){if(b.rows.length>=50)return toast('Максимум 50 строк');b.rows.push(b.headers.map(()=>''));}
  if(action==='row-remove'){if(b.rows.length<=1)return;if(!confirm('Удалить последнюю строку с её содержимым?'))return;b.rows.pop();}
  if(action==='col-add'){if(b.headers.length>=16)return toast('Максимум 16 столбцов');b.headers.push('Столбец');b.rows.forEach(r=>r.push(''));}
  if(action==='col-remove'){if(b.headers.length<=1)return;if(!confirm('Удалить последний столбец с его содержимым?'))return;b.headers.pop();b.rows.forEach(r=>r.pop());}
  setDirty();renderClass();document.getElementById('section-'+b.id)?.scrollIntoView({block:'center'});
}
async function exportJson(){try{const value=normalized();const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=current.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message);}}
async function importJson(file){
  if(!file)return;try{if(file.size>1800000)throw Error('Слишком большой файл');let c=JSON.parse(await file.text());c.id=uid();c.revision=0;delete c._requestId;delete c.updatedAt;validateClass(c);for(const b of c.blocks)if(b.html)b.html=sanitizeHtml(b.html);if(!canLeave())return;current=c;editing=true;dirty=true;writeDraft();history.pushState(null,'',urlFor(c.id,true));renderClass();toast('Копия импортирована в редактор. Нажми «Сохранить».');}catch(e){toast('Ошибка импорта: '+e.message);}
}
function showSettings(){document.querySelector('#api-url').value=apiUrl;document.querySelector('#settings-error').textContent='';dialog.showModal();}
async function changeConnection(url){if(!canLeave())return;apiUrl=url;localStorage.setItem('codex-api-url',url);initStore();dialog.close();dirty=false;history.pushState(null,'',urlFor());await route();}
document.querySelector('#connect').onclick=()=>{const value=document.querySelector('#api-url').value.trim();try{const u=new URL(value);if(u.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)||u.search||u.hash)throw Error();changeConnection(value);}catch{document.querySelector('#settings-error').textContent='Нужен URL вида https://script.google.com/macros/s/…/exec без параметров.';}};
document.querySelector('#demo').onclick=()=>changeConnection('');

document.addEventListener('click',async e=>{
  const el=e.target.closest('button,a,[data-add]');if(!el)return;
  if(el.hasAttribute('data-home')){e.preventDefault();await navigate();return;}
  if(el.dataset.open){e.preventDefault();await navigate(el.dataset.open);return;}
  if(el.hasAttribute('data-top')){e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});return;}
  if(el.dataset.section){e.preventDefault();document.getElementById('section-'+el.dataset.section)?.scrollIntoView({behavior:'smooth'});return;}
  if(el.dataset.add){addBlock(el.dataset.add);return;}
  if(el.dataset.blockAction){blockAction(el.dataset.blockAction,el);return;}
  if(el.dataset.format){
    if(!activeRich || !selection){toast('Сначала поставь курсор в текст блока.');return;}
    activeRich.focus();const sel=window.getSelection();sel.removeAllRanges();sel.addRange(selection);
    let command=el.dataset.format,value=el.dataset.value||null;
    if(command==='link'){value=prompt('Полный адрес ссылки (https://…)');if(!value)return;try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error();value=u.href;}catch{toast('Нужна ссылка http:// или https://');return;}command='createLink';}
    document.execCommand(command,false,value);syncRich(activeRich);return;
  }
  switch(el.dataset.action){
    case 'catalog':await navigate();break;
    case 'settings':showSettings();break;
    case 'retry':case 'refresh':await route();break;
    case 'new':if(canLeave()){current=newClass();editing=true;dirty=true;writeDraft();history.pushState(null,'',urlFor(current.id,true));renderClass();}break;
    case 'edit':await navigate(current.id,true);break;
    case 'view':if(current.revision===0){toast('Сначала сохрани новый класс.');break;}await navigate(current.id);break;
    case 'save':await save();break;
    case 'export':await exportJson();break;
    case 'print':window.print();break;
    case 'restore':{const d=draft(current.id);if(d){current=d;dirty=true;renderClass();}}break;
    case 'discard-draft':sessionStorage.removeItem(draftKey(current.id));renderClass();break;
  }
});
document.addEventListener('input',e=>{
  const el=e.target;if(!editing)return;
  if(el.dataset.field){current[el.dataset.field]=el.value;setDirty();}
  if(el.dataset.blockField){const b=current.blocks.find(b=>b.id===el.closest('[data-block]').dataset.block);b[el.dataset.blockField]=el.dataset.blockField==='level'?Number(el.value):el.value;setDirty();}
  if(el.hasAttribute('data-rich'))syncRich(el);
  const cell=el.closest('[data-cell]');if(cell){const b=current.blocks.find(b=>b.id===cell.closest('[data-block]').dataset.block);const [row,col]=cell.dataset.cell.split(':');if(row==='header')b.headers[+col]=cell.textContent;else b.rows[+row][+col]=cell.textContent;setDirty();}
});
document.addEventListener('change',e=>{if(e.target.id==='import')importJson(e.target.files[0]);});
document.addEventListener('selectionchange',()=>{const sel=window.getSelection();if(!sel.rangeCount)return;const node=sel.anchorNode;const rich=(node?.nodeType===1?node:node?.parentElement)?.closest('[data-rich]');const end=sel.focusNode?.nodeType===1?sel.focusNode:sel.focusNode?.parentElement;if(rich&&rich.contains(end)){activeRich=rich;selection=sel.getRangeAt(0).cloneRange();}});
document.addEventListener('mousedown',e=>{if(e.target.closest('[data-format]'))e.preventDefault();});
document.addEventListener('paste',e=>{const rich=e.target.closest('[data-rich]'),cell=e.target.closest('[data-cell]');if(!rich&&!cell)return;e.preventDefault();if(cell)document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));else{const html=e.clipboardData.getData('text/html');document.execCommand('insertHTML',false,html?sanitizeHtml(html):esc(e.clipboardData.getData('text/plain')).replace(/\n/g,'<br>'));syncRich(rich);}});
document.addEventListener('drop',e=>{if(e.target.closest('[contenteditable]'))e.preventDefault();});
window.addEventListener('beforeunload',e=>{if(dirty||saving){writeDraft();e.preventDefault();e.returnValue='';}});
window.addEventListener('popstate',()=>{if(dirty){writeDraft();if(!canLeave()){history.pushState(null,'',urlFor(current.id,editing));return;}}dirty=false;clearTimeout(draftTimer);route();});
window.addEventListener('hashchange',()=>{if(dirty)writeDraft();dirty=false;route();});
initStore();route();


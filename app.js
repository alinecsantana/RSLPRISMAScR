'use strict';
// ============================================================
// RSL SYSTEM — PRISMA-ScR  v1.0
// ============================================================

const STORAGE_KEY = 'rsl_prisma_scr_v1'; // mantido só para migração legacy

// ── INDEXEDDB (armazenamento principal — sem limite de 5 MB) ──
const IDB_NAME    = 'rsl_prisma_scr';
const IDB_VERSION = 1;
const IDB_STORE   = 'state';
const IDB_KEY     = 'main';
let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess  = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror    = e => reject(e.target.error);
  });
}
function idbGet() {
  return openIDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly')
                  .objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  }));
}
function idbPut(data) {
  return openIDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  }));
}
function idbDelete() {
  return openIDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  }));
}

// ── INITIAL STATE ────────────────────────────────────────────
function createState() {
  return {
    version: '1.0',
    createdAt: now(),
    updatedAt: now(),
    project: {
      title: '',
      researchQuestion: '',
      pcc: { population: '', concept: '', context: '' },
      objective: '',
      protocolRegistration: '',
      startDate: today(),
      team: []
    },
    criteria: { inclusion: [], exclusion: [] },
    databases: [],
    competenceQuestions: [],
    extractionFields: [
      { id: uid(), label: 'Objetivo do estudo', type: 'textarea', required: true },
      { id: uid(), label: 'Metodologia', type: 'text', required: false },
      { id: uid(), label: 'Amostra / Participantes', type: 'text', required: false },
      { id: uid(), label: 'Principais resultados', type: 'textarea', required: true },
      { id: uid(), label: 'Limitações', type: 'textarea', required: false },
      { id: uid(), label: 'Conclusões dos autores', type: 'textarea', required: false }
    ],
    records: [],
    apiKeys: { openalex: '', semantic: '', ieee: '', springer: '', scopus: '' },
    settings: { useProxy: true },
    phases: {
      deduplication: { completed: false, completedAt: null, notes: '' },
      screening:     { completed: false, completedAt: null, notes: '' },
      eligibility:   { completed: false, completedAt: null, notes: '' },
      extraction:    { completed: false, completedAt: null, notes: '' }
    },
    auditLog: []
  };
}

// ── UTILITIES ────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return inter / union;
}
function el(id) { return document.getElementById(id); }
function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }

// ── STATE ────────────────────────────────────────────────────
let S = null;

async function loadState() {
  try {
    // migra dado legacy do localStorage para IndexedDB (roda só uma vez)
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      S = JSON.parse(legacy);
      localStorage.removeItem(STORAGE_KEY);
      await idbPut(S);
    } else {
      S = (await idbGet()) ?? createState();
    }
    if (!S.apiKeys)  S.apiKeys  = { openalex: '', semantic: '', ieee: '', springer: '', scopus: '' };
    if (!S.settings) S.settings = { useProxy: true };
  } catch(e) {
    S = createState();
  }
}

function slimRecords(records) {
  // retorna cópia enxuta: sem rawData, abstracts truncados
  return records.map(r => {
    const slim = Object.assign({}, r);
    delete slim.rawData;
    if (slim.abstract && slim.abstract.length > 500) slim.abstract = slim.abstract.slice(0, 500) + '…';
    if (slim.keywords && slim.keywords.length > 300) slim.keywords = slim.keywords.slice(0, 300);
    return slim;
  });
}

function saveState() {
  S.updatedAt = now();
  el('save-dot').classList.remove('dirty');
  el('save-text').textContent = 'Salvando…';
  updateSidebarBadges();
  idbPut(JSON.parse(JSON.stringify(S)))
    .then(() => {
      el('save-text').textContent = 'Salvo';
      el('save-time').textContent = fmtDate(S.updatedAt);
    })
    .catch(err => {
      console.error('Erro ao salvar (IDB):', err);
      el('save-dot').classList.add('dirty');
      el('save-text').textContent = 'Erro ao salvar!';
      toast('Erro ao salvar dados. Exporte o projeto por segurança.', 'error', 8000);
    });
}

function markDirty() {
  el('save-dot').classList.add('dirty');
  el('save-text').textContent = 'Não salvo';
}

function autoSave() { saveState(); }

// ── AUDIT LOG ────────────────────────────────────────────────
const AUDIT_ICONS = {
  import: '📥', dedup: '🔍', screening: '🔬', eligibility: '📄',
  extraction: '📊', qualitative: '💬', protocol: '📋', db: '🗄',
  system: '⚙️', phase: '✅', delete: '🗑'
};

function audit(category, action, details = {}) {
  S.auditLog.unshift({
    id: uid(), ts: now(), category, action, details
  });
  autoSave();
}

// ── TOAST NOTIFICATIONS ──────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const wrap = el('toast-container');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  div.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${esc(msg)}</span>`;
  wrap.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

// ── MODAL ────────────────────────────────────────────────────
function openModal(title, bodyHtml, footerHtml = '') {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  el('modal-footer').innerHTML = footerHtml;
  el('modal-overlay').classList.remove('hidden');
}
function closeModal() { el('modal-overlay').classList.add('hidden'); }

// ── ROUTER ───────────────────────────────────────────────────
let currentView = 'protocol';
const VIEW_TITLES = {
  protocol: 'Protocolo da Revisão',
  databases: 'Bases de Dados',
  autosearch: 'Busca Automática nas Bases',
  import: 'Importar Resultados',
  deduplication: 'Deduplicação',
  screening: 'Triagem — Título e Resumo',
  eligibility: 'Elegibilidade — Texto Completo',
  extraction: 'Extração de Dados (Charting)',
  qualitative: 'Análise Qualitativa — Competence Questions',
  prisma: 'Fluxograma PRISMA-ScR',
  audit: 'Log de Auditoria',
  report: 'Relatórios e Exportação'
};

function navigate(view) {
  currentView = view;
  qsa('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.view === view));
  el('view-title').textContent = VIEW_TITLES[view] || view;
  el('breadcrumb').textContent = S.project.title || 'Projeto não configurado';
  const area = el('content-area');
  const renders = {
    protocol: renderProtocol, databases: renderDatabases,
    autosearch: () => window._autoSearchView && window._autoSearchView(),
    import: renderImport,
    deduplication: renderDeduplication, screening: renderScreening,
    eligibility: renderEligibility, extraction: renderExtraction,
    qualitative: renderQualitative, prisma: renderPrisma,
    audit: renderAudit, report: renderReport
  };
  area.innerHTML = '';
  if (renders[view]) renders[view]();
}

function updateSidebarBadges() {
  const r = calcPrisma();
  const badges = {
    protocol:      S.project.title ? 'done' : 'empty',
    databases:     S.databases.length > 0 ? 'done' : 'empty',
    import:        r.totalImported > 0 ? 'done' : 'empty',
    deduplication: S.phases.deduplication.completed ? 'done' : (r.totalImported > 0 ? 'partial' : 'empty'),
    screening:     S.phases.screening.completed ? 'done' : (r.afterDedup > 0 ? 'partial' : 'empty'),
    eligibility:   S.phases.eligibility.completed ? 'done' : (r.screeningIncluded > 0 ? 'partial' : 'empty'),
    extraction:    S.phases.extraction.completed ? 'done' : (r.eligibilityIncluded > 0 ? 'partial' : 'empty'),
    qualitative:   S.competenceQuestions.some(cq => cq.answer) ? 'done' : 'empty'
  };
  Object.entries(badges).forEach(([k,v]) => {
    const el2 = el(`ns-${k}`);
    if (el2) { el2.className = `nav-status ${v}`; }
  });
  el('sidebar-project-name').textContent = S.project.title || 'Projeto não configurado';
}

// ── PRISMA CALCULATIONS ──────────────────────────────────────
function calcPrisma() {
  const all = S.records;
  const totalImported = all.length;
  const duplicates = all.filter(r => r.isDuplicate).length;
  const afterDedup = totalImported - duplicates;
  const active = all.filter(r => !r.isDuplicate);

  const screeningPending  = active.filter(r => r.screening.decision === 'pending' || !r.screening.decision).length;
  const screeningIncluded = active.filter(r => r.screening.decision === 'included').length;
  const screeningExcluded = active.filter(r => r.screening.decision === 'excluded').length;

  const eligActive    = active.filter(r => r.screening.decision === 'included');
  const eligPending   = eligActive.filter(r => !r.eligibility.decision || r.eligibility.decision === 'pending').length;
  const eligNotRetrieved = eligActive.filter(r => r.eligibility.notRetrieved).length;
  const eligAssessed  = eligActive.filter(r => r.eligibility.decision && r.eligibility.decision !== 'pending' && !r.eligibility.notRetrieved).length;
  const eligIncluded  = eligActive.filter(r => r.eligibility.decision === 'included').length;
  const eligExcluded  = eligActive.filter(r => r.eligibility.decision === 'excluded').length;

  // breakdown by criteria
  const screenExclByCriteria = {};
  active.filter(r => r.screening.decision === 'excluded').forEach(r => {
    (r.screening.criteria || []).forEach(cid => {
      screenExclByCriteria[cid] = (screenExclByCriteria[cid] || 0) + 1;
    });
    if (!r.screening.criteria?.length) {
      screenExclByCriteria['__other__'] = (screenExclByCriteria['__other__'] || 0) + 1;
    }
  });

  const eligExclByCriteria = {};
  eligActive.filter(r => r.eligibility.decision === 'excluded').forEach(r => {
    (r.eligibility.criteria || []).forEach(cid => {
      eligExclByCriteria[cid] = (eligExclByCriteria[cid] || 0) + 1;
    });
    if (!r.eligibility.criteria?.length) {
      eligExclByCriteria['__other__'] = (eligExclByCriteria['__other__'] || 0) + 1;
    }
  });

  const dbBreakdown = {};
  S.databases.forEach(db => {
    dbBreakdown[db.id] = { name: db.name, count: all.filter(r => r.sourceDatabase === db.id).length };
  });

  return {
    totalImported, duplicates, afterDedup,
    screeningPending, screeningIncluded, screeningExcluded,
    eligPending, eligNotRetrieved, eligAssessed,
    eligIncluded, eligExcluded,
    screenExclByCriteria, eligExclByCriteria,
    dbBreakdown
  };
}

// ── VIEW: PROTOCOL ───────────────────────────────────────────
function renderProtocol() {
  const p = S.project;
  const inc = S.criteria.inclusion;
  const exc = S.criteria.exclusion;

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Protocolo da Revisão de Escopo</div>
    <div class="section-subtitle">PRISMA-ScR — Preferred Reporting Items for Systematic reviews and Meta-Analyses extension for Scoping Reviews</div>
  </div>
  <button class="btn btn-primary" onclick="saveProtocol()">💾 Salvar Protocolo</button>
</div>

<div class="card mb-16">
  <div class="card-header"><span class="card-title">📋 Identificação do Projeto</span></div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      <div class="form-group" style="grid-column:span 2">
        <label>Título da Revisão <span class="req">*</span></label>
        <input type="text" id="p-title" value="${esc(p.title)}" placeholder="Ex: Uma revisão de escopo sobre…">
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label>Questão de Pesquisa Principal <span class="req">*</span></label>
        <textarea id="p-rq" rows="3" placeholder="Ex: Quais estratégias de…">${esc(p.researchQuestion)}</textarea>
      </div>
      <div class="form-group">
        <label>Data de Início</label>
        <input type="date" id="p-start" value="${esc(p.startDate)}">
      </div>
      <div class="form-group">
        <label>Registro do Protocolo (ex: OSF, PROSPERO)</label>
        <input type="text" id="p-reg" value="${esc(p.protocolRegistration)}" placeholder="Ex: OSF: https://…">
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label>Objetivo da Revisão</label>
        <textarea id="p-obj" rows="2" placeholder="Descreva o objetivo geral…">${esc(p.objective)}</textarea>
      </div>
    </div>
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">🎯 Framework PCC (Population · Concept · Context)</span>
    <span class="badge badge-blue">PRISMA-ScR Item 4</span>
  </div>
  <div class="card-body">
    <div class="form-grid form-grid-3">
      <div class="form-group">
        <label>Population (P) <span class="req">*</span></label>
        <textarea id="p-pcc-p" rows="3" placeholder="Quem? Ex: adultos com…">${esc(p.pcc.population)}</textarea>
        <div class="form-hint">Características dos participantes/sujeitos</div>
      </div>
      <div class="form-group">
        <label>Concept (C) <span class="req">*</span></label>
        <textarea id="p-pcc-c" rows="3" placeholder="O quê? Ex: intervenções baseadas em…">${esc(p.pcc.concept)}</textarea>
        <div class="form-hint">Fenômeno, intervenção ou área de interesse</div>
      </div>
      <div class="form-group">
        <label>Context (C) <span class="req">*</span></label>
        <textarea id="p-pcc-ctx" rows="3" placeholder="Onde/como? Ex: ambiente hospitalar…">${esc(p.pcc.context)}</textarea>
        <div class="form-hint">Contexto cultural, geográfico, temático</div>
      </div>
    </div>
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">✅ Critérios de Inclusão</span>
    <button class="btn btn-sm btn-success" onclick="addCriterion('inclusion')">+ Adicionar</button>
  </div>
  <div class="card-body" id="inclusion-list">
    ${renderCriteriaList(inc, 'inclusion')}
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">❌ Critérios de Exclusão</span>
    <button class="btn btn-sm btn-danger" onclick="addCriterion('exclusion')">+ Adicionar</button>
  </div>
  <div class="card-body" id="exclusion-list">
    ${renderCriteriaList(exc, 'exclusion')}
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">💬 Competence Questions (Análise Qualitativa)</span>
    <button class="btn btn-sm btn-primary" onclick="addCQ()">+ Adicionar CQ</button>
  </div>
  <div class="card-body" id="cq-list">
    ${renderCQProtocolList()}
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">📊 Campos de Extração de Dados</span>
    <button class="btn btn-sm btn-primary" onclick="addExtractionField()">+ Adicionar Campo</button>
  </div>
  <div class="card-body" id="ef-list">
    ${renderExtractionFieldsList()}
  </div>
</div>

<div class="card">
  <div class="card-header">
    <span class="card-title">👥 Equipe da Revisão</span>
    <button class="btn btn-sm btn-ghost" onclick="addTeamMember()">+ Adicionar</button>
  </div>
  <div class="card-body" id="team-list">
    ${renderTeamList()}
  </div>
</div>
`;
}

function renderCriteriaList(list, type) {
  if (!list.length) return `<div class="text-muted text-sm">Nenhum critério cadastrado.</div>`;
  return list.map((c, i) => `
    <div class="checklist-item" id="crit-${c.id}">
      <span class="checklist-num">${type === 'inclusion' ? 'I' : 'E'}${i + 1}</span>
      <div style="flex:1">
        <input type="text" value="${esc(c.text)}" placeholder="Descreva o critério…"
          oninput="updateCriterion('${type}','${c.id}',this.value)" style="margin-bottom:0">
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removeCriterion('${type}','${c.id}')">✕</button>
    </div>
  `).join('');
}

function renderCQProtocolList() {
  if (!S.competenceQuestions.length) return `<div class="text-muted text-sm">Nenhuma CQ cadastrada.</div>`;
  return S.competenceQuestions.map((cq, i) => `
    <div class="checklist-item">
      <span class="checklist-num">CQ${i + 1}</span>
      <div style="flex:1">
        <input type="text" value="${esc(cq.question)}" placeholder="Formule a competence question…"
          oninput="updateCQ('${cq.id}',this.value)">
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removeCQ('${cq.id}')">✕</button>
    </div>
  `).join('');
}

function renderExtractionFieldsList() {
  if (!S.extractionFields.length) return `<div class="text-muted text-sm">Nenhum campo cadastrado.</div>`;
  return S.extractionFields.map((f, i) => `
    <div class="checklist-item">
      <span class="checklist-num">${i + 1}</span>
      <div style="flex:1;display:flex;gap:8px;align-items:center">
        <input type="text" value="${esc(f.label)}" placeholder="Nome do campo"
          oninput="updateEF('${f.id}','label',this.value)" style="flex:2">
        <select onchange="updateEF('${f.id}','type',this.value)" style="flex:1">
          <option value="text" ${f.type==='text'?'selected':''}>Texto curto</option>
          <option value="textarea" ${f.type==='textarea'?'selected':''}>Texto longo</option>
          <option value="number" ${f.type==='number'?'selected':''}>Número</option>
          <option value="select" ${f.type==='select'?'selected':''}>Seleção</option>
        </select>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removeEF('${f.id}')">✕</button>
    </div>
  `).join('');
}

function renderTeamList() {
  if (!S.project.team.length) return `<div class="text-muted text-sm">Nenhum membro cadastrado.</div>`;
  return S.project.team.map(m => `
    <div class="checklist-item">
      <span class="checklist-num">👤</span>
      <div style="flex:1;display:flex;gap:8px">
        <input type="text" value="${esc(m.name)}" placeholder="Nome"
          oninput="updateMember('${m.id}','name',this.value)" style="flex:2">
        <input type="text" value="${esc(m.role)}" placeholder="Papel (ex: revisor independente)"
          oninput="updateMember('${m.id}','role',this.value)" style="flex:2">
      </div>
      <button class="btn btn-sm btn-ghost" onclick="removeMember('${m.id}')">✕</button>
    </div>
  `).join('');
}

function saveProtocol() {
  S.project.title           = el('p-title').value.trim();
  S.project.researchQuestion= el('p-rq').value.trim();
  S.project.objective       = el('p-obj').value.trim();
  S.project.startDate       = el('p-start').value;
  S.project.protocolRegistration = el('p-reg').value.trim();
  S.project.pcc.population  = el('p-pcc-p').value.trim();
  S.project.pcc.concept     = el('p-pcc-c').value.trim();
  S.project.pcc.context     = el('p-pcc-ctx').value.trim();
  audit('protocol', 'Protocolo atualizado', { title: S.project.title });
  saveState();
  toast('Protocolo salvo!', 'success');
}

function addCriterion(type) {
  const c = { id: uid(), text: '', type };
  S.criteria[type].push(c);
  saveState();
  el(`${type}-list`).innerHTML = renderCriteriaList(S.criteria[type], type);
}
function updateCriterion(type, id, val) {
  const c = S.criteria[type].find(x => x.id === id);
  if (c) { c.text = val; markDirty(); }
}
function removeCriterion(type, id) {
  S.criteria[type] = S.criteria[type].filter(x => x.id !== id);
  saveState();
  el(`${type}-list`).innerHTML = renderCriteriaList(S.criteria[type], type);
}
function addCQ() {
  S.competenceQuestions.push({ id: uid(), question: '', answer: '', citations: [] });
  saveState();
  el('cq-list').innerHTML = renderCQProtocolList();
}
function updateCQ(id, val) {
  const cq = S.competenceQuestions.find(x => x.id === id);
  if (cq) { cq.question = val; markDirty(); }
}
function removeCQ(id) {
  S.competenceQuestions = S.competenceQuestions.filter(x => x.id !== id);
  saveState();
  el('cq-list').innerHTML = renderCQProtocolList();
}
function addExtractionField() {
  S.extractionFields.push({ id: uid(), label: '', type: 'text', required: false });
  saveState();
  el('ef-list').innerHTML = renderExtractionFieldsList();
}
function updateEF(id, key, val) {
  const f = S.extractionFields.find(x => x.id === id);
  if (f) { f[key] = val; markDirty(); }
}
function removeEF(id) {
  S.extractionFields = S.extractionFields.filter(x => x.id !== id);
  saveState();
  el('ef-list').innerHTML = renderExtractionFieldsList();
}
function addTeamMember() {
  S.project.team.push({ id: uid(), name: '', role: '' });
  saveState();
  el('team-list').innerHTML = renderTeamList();
}
function updateMember(id, key, val) {
  const m = S.project.team.find(x => x.id === id);
  if (m) { m[key] = val; markDirty(); }
}
function removeMember(id) {
  S.project.team = S.project.team.filter(x => x.id !== id);
  saveState();
  el('team-list').innerHTML = renderTeamList();
}

// ── VIEW: DATABASES ──────────────────────────────────────────
function renderDatabases() {
  const dbs = S.databases;
  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Bases de Dados Pesquisadas</div>
    <div class="section-subtitle">Registre cada base, a string de busca utilizada, a data e o número de resultados encontrados.</div>
  </div>
  <button class="btn btn-primary" onclick="openAddDB()">+ Adicionar Base</button>
</div>
${!dbs.length ? `
  <div class="empty-state">
    <div class="empty-icon">🗄</div>
    <div class="empty-title">Nenhuma base cadastrada</div>
    <div class="empty-text">Adicione as bases de dados que foram pesquisadas (ex: PubMed, Scopus, Web of Science)</div>
  </div>` : `
<div class="table-wrap">
  <table>
    <thead><tr>
      <th>#</th><th>Base</th><th>Acrônimo</th><th>Data de Busca</th>
      <th>String de Busca</th><th>Resultados encontrados</th><th>Importados</th><th></th>
    </tr></thead>
    <tbody>
      ${dbs.map((db, i) => {
        const imported = S.records.filter(r => r.sourceDatabase === db.id).length;
        return `<tr>
          <td class="td-muted">${i+1}</td>
          <td class="td-title">${esc(db.name)}</td>
          <td><span class="badge badge-blue">${esc(db.acronym)}</span></td>
          <td class="td-muted">${fmtDateShort(db.searchDate)}</td>
          <td class="td-truncate" style="max-width:200px" title="${esc(db.searchString)}">${esc(db.searchString) || '<span class="text-muted">—</span>'}</td>
          <td><strong>${db.recordsFound ?? '—'}</strong></td>
          <td>${imported > 0 ? `<span class="badge badge-green">${imported}</span>` : '<span class="badge badge-slate">0</span>'}</td>
          <td class="td-actions">
            <button class="btn btn-sm btn-ghost" onclick="openEditDB('${db.id}')">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="openViewString('${db.id}')">🔍</button>
            <button class="btn btn-sm btn-ghost" onclick="removeDB('${db.id}')">🗑</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`}
`;
}

function openAddDB() { openDBModal(null); }
function openEditDB(id) { openDBModal(S.databases.find(d => d.id === id)); }

function openDBModal(db) {
  const isEdit = !!db;
  openModal(
    isEdit ? 'Editar Base de Dados' : 'Adicionar Base de Dados',
    `<div class="form-grid">
      <div class="form-group">
        <label>Nome da Base <span class="req">*</span></label>
        <input id="db-name" type="text" value="${esc(db?.name)}" placeholder="Ex: PubMed">
      </div>
      <div class="form-group">
        <label>Acrônimo</label>
        <input id="db-acronym" type="text" value="${esc(db?.acronym)}" placeholder="Ex: MEDLINE">
      </div>
      <div class="form-group">
        <label>Data da Busca</label>
        <input id="db-date" type="date" value="${esc(db?.searchDate || today())}">
      </div>
      <div class="form-group">
        <label>Nº de Resultados Encontrados</label>
        <input id="db-found" type="number" value="${db?.recordsFound ?? ''}" placeholder="Ex: 342">
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label>String de Busca</label>
        <textarea id="db-string" rows="5" placeholder="Cole aqui a string de busca completa utilizada…">${esc(db?.searchString)}</textarea>
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label>Observações</label>
        <textarea id="db-notes" rows="2" placeholder="Filtros adicionais, limitações, etc.">${esc(db?.notes)}</textarea>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveDB('${db?.id || ''}')">Salvar</button>`
  );
}

function saveDB(existingId) {
  const name = el('db-name').value.trim();
  if (!name) { toast('Nome da base é obrigatório', 'error'); return; }
  const data = {
    name, acronym: el('db-acronym').value.trim(),
    searchDate: el('db-date').value,
    recordsFound: parseInt(el('db-found').value) || null,
    searchString: el('db-string').value.trim(),
    notes: el('db-notes').value.trim()
  };
  if (existingId) {
    const db = S.databases.find(d => d.id === existingId);
    Object.assign(db, data);
    audit('db', `Base editada: ${name}`, data);
  } else {
    data.id = uid();
    data.createdAt = now();
    S.databases.push(data);
    audit('db', `Base adicionada: ${name}`, data);
  }
  saveState();
  closeModal();
  renderDatabases();
  toast(`Base "${name}" salva!`, 'success');
}

function removeDB(id) {
  const db = S.databases.find(d => d.id === id);
  if (!confirm(`Remover a base "${db?.name}"? Os registros importados desta base também serão removidos.`)) return;
  S.records = S.records.filter(r => r.sourceDatabase !== id);
  S.databases = S.databases.filter(d => d.id !== id);
  audit('delete', `Base removida: ${db?.name}`);
  saveState();
  renderDatabases();
}

function openViewString(id) {
  const db = S.databases.find(d => d.id === id);
  openModal(`String de Busca — ${db.name}`, `<pre>${esc(db.searchString || 'Nenhuma string registrada.')}</pre>`, `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>`);
}

// ── VIEW: IMPORT ─────────────────────────────────────────────
let importState = { db: null, file: null, headers: [], rows: [], mapping: {}, step: 1 };

function renderImport() {
  const dbs = S.databases;
  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Importar Resultados das Buscas</div>
    <div class="section-subtitle">Importe arquivos CSV ou XLSX exportados de cada base de dados.</div>
  </div>
</div>

<div class="card mb-16">
  <div class="card-header"><span class="card-title">Importação de Arquivo</span></div>
  <div class="card-body">
    ${!dbs.length ? `<div class="phase-banner locked">⚠️ Cadastre ao menos uma base de dados antes de importar.</div>` : `
    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label>Base de Dados <span class="req">*</span></label>
        <select id="import-db-select">
          <option value="">Selecione a base…</option>
          ${dbs.map(db => `<option value="${db.id}">${esc(db.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Arquivo CSV ou XLSX <span class="req">*</span></label>
        <input type="file" id="import-file" accept=".csv,.xlsx,.xls" onchange="handleImportFile(event)">
        <div class="form-hint">Exporte da base de dados e carregue aqui</div>
      </div>
    </div>
    <div id="import-preview"></div>
    `}
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="card-title">Registros Importados por Base</span></div>
  <div class="card-body">
    ${!S.records.length ? `<div class="text-muted text-sm">Nenhum registro importado ainda.</div>` :
    dbs.map(db => {
      const recs = S.records.filter(r => r.sourceDatabase === db.id);
      if (!recs.length) return '';
      return `<div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <strong>${esc(db.name)}</strong>
          <span class="badge badge-blue">${recs.length} registros</span>
        </div>
        <div class="progress-bar-wrap" style="max-width:400px"><div class="progress-bar-fill" style="width:100%"></div></div>
      </div>`;
    }).join('') || '<div class="text-muted text-sm">Nenhuma base com registros importados.</div>'}
    ${S.records.length ? `<div class="mt-12">
      <strong>${S.records.length}</strong> registros no total.
      <button class="btn btn-sm btn-ghost" style="margin-left:12px" onclick="navigate('deduplication')">→ Ir para Deduplicação</button>
    </div>` : ''}
  </div>
</div>
`;
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const dbId = el('import-db-select').value;
  if (!dbId) { toast('Selecione a base de dados primeiro', 'warning'); return; }
  importState.db = dbId;
  importState.file = file;
  const reader = new FileReader();
  if (file.name.endsWith('.csv')) {
    reader.onload = e => { parseCSV(e.target.result); };
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.onload = e => { parseXLSX(e.target.result); };
    reader.readAsArrayBuffer(file);
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) { toast('Arquivo CSV vazio', 'error'); return; }
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = splitCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v.trim()));
  showMapping(headers, rows);
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQ) { inQ = true; continue; }
    if (ch === '"' && inQ) { if (line[i+1] === '"') { cur += '"'; i++; } else inQ = false; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseXLSX(buffer) {
  if (typeof XLSX === 'undefined') {
    toast('SheetJS não carregado. Use CSV ou conecte à internet.', 'error');
    return;
  }
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) { toast('Planilha vazia', 'error'); return; }
  const headers = Object.keys(rows[0]);
  showMapping(headers, rows);
}

const FIELD_HINTS = {
  title: ['title', 'titulo', 'título', 'article title', 'document title'],
  authors: ['author', 'authors', 'autores', 'autor'],
  year: ['year', 'ano', 'publication year', 'pub year', 'py'],
  abstract: ['abstract', 'resumo', 'ab'],
  doi: ['doi'],
  journal: ['journal', 'source', 'revista', 'periódico', 'publication'],
  keywords: ['keywords', 'key words', 'palavras-chave', 'de', 'id'],
  url: ['url', 'link', 'ut']
};

function guessMapping(headers) {
  const mapping = {};
  const lh = headers.map(h => h.toLowerCase());
  Object.entries(FIELD_HINTS).forEach(([field, hints]) => {
    const idx = lh.findIndex(h => hints.some(hint => h.includes(hint)));
    if (idx >= 0) mapping[field] = headers[idx];
  });
  return mapping;
}

function showMapping(headers, rows) {
  importState.headers = headers;
  importState.rows = rows;
  importState.mapping = guessMapping(headers);
  const fields = [
    { key: 'title',    label: 'Título', required: true },
    { key: 'authors',  label: 'Autores', required: false },
    { key: 'year',     label: 'Ano', required: false },
    { key: 'abstract', label: 'Resumo', required: false },
    { key: 'doi',      label: 'DOI', required: false },
    { key: 'journal',  label: 'Periódico / Fonte', required: false },
    { key: 'keywords', label: 'Palavras-chave', required: false },
    { key: 'url',      label: 'URL', required: false }
  ];

  const opts = ['', ...headers].map(h => `<option value="${esc(h)}">${esc(h) || '— ignorar —'}</option>`).join('');

  el('import-preview').innerHTML = `
  <hr class="hr">
  <div class="mb-12"><strong>Arquivo carregado:</strong> ${importState.rows.length} registros, ${headers.length} colunas</div>
  <div class="mb-12">
    <strong>Mapeamento de colunas</strong>
    <div class="form-hint">Associe as colunas do arquivo aos campos do sistema. O campo "Título" é obrigatório.</div>
  </div>
  <table class="mapping-table">
    <thead><tr><th>Campo do Sistema</th><th>Coluna no Arquivo</th><th>Prévia</th></tr></thead>
    <tbody>
      ${fields.map(f => {
        const selVal = importState.mapping[f.key] || '';
        const preview = selVal && rows[0] ? String(rows[0][selVal] || '').slice(0, 60) : '—';
        return `<tr>
          <td><strong>${f.label}</strong>${f.required ? ' <span class="req">*</span>':''}</td>
          <td>
            <select id="map-${f.key}" onchange="updateMapping('${f.key}', this.value)">
              ${['', ...headers].map(h => `<option value="${esc(h)}" ${h===selVal?'selected':''}>${esc(h)||'— ignorar —'}</option>`).join('')}
            </select>
          </td>
          <td class="text-muted text-sm">${esc(preview)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div style="margin-top:16px">
    <button class="btn btn-primary" onclick="executeImport()">📥 Importar ${importState.rows.length} Registros</button>
  </div>
  `;
}

function updateMapping(field, col) {
  importState.mapping[field] = col;
  // update preview column
  const rows = importState.rows;
  const preview = col && rows[0] ? String(rows[0][col] || '').slice(0, 60) : '—';
}

function executeImport() {
  const { db, rows, mapping } = importState;
  if (!mapping.title) { toast('Mapeie ao menos a coluna "Título"', 'error'); return; }
  const get = (row, field) => {
    const col = mapping[field];
    return col ? String(row[col] || '').trim() : '';
  };
  let added = 0, skipped = 0;
  rows.forEach(row => {
    const title = get(row, 'title');
    if (!title) { skipped++; return; }
    const rec = {
      id: uid(), sourceDatabase: db, importedAt: now(),
      title, authors: get(row, 'authors'), year: get(row, 'year'),
      abstract: (get(row, 'abstract') || '').slice(0, 500),
      doi: get(row, 'doi').toLowerCase(),
      journal: get(row, 'journal'), keywords: get(row, 'keywords'), url: get(row, 'url'),
      isDuplicate: false, duplicateOf: null, duplicateReason: '',
      screening: { decision: 'pending', criteria: [], note: '', decidedAt: null },
      eligibility: { decision: 'pending', criteria: [], note: '', notRetrieved: false, decidedAt: null },
      extraction: { completed: false, completedAt: null, data: {} }
    };
    S.records.push(rec);
    added++;
  });
  const dbName = S.databases.find(d => d.id === db)?.name;
  audit('import', `Importados ${added} registros de ${dbName}`, { added, skipped, database: dbName });
  saveState();
  toast(`${added} registros importados (${skipped} ignorados por título vazio)`, 'success');
  renderImport();
}

// ── VIEW: DEDUPLICATION ──────────────────────────────────────
function renderDeduplication() {
  const r = calcPrisma();
  const phase = S.phases.deduplication;
  const dups = S.records.filter(x => x.isDuplicate);

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Deduplicação</div>
    <div class="section-subtitle">Identifique e marque registros duplicados entre as bases de dados.</div>
  </div>
  <div class="btn-group">
    <button class="btn btn-warning" onclick="runAutoDeduplicate()">🔍 Detectar Automático</button>
    ${!phase.completed ? `<button class="btn btn-success" onclick="completeDeduplication()">✅ Concluir Deduplicação</button>` : ''}
  </div>
</div>

${phase.completed ? `<div class="phase-banner complete">✅ Deduplicação concluída em ${fmtDate(phase.completedAt)}. ${dups.length} duplicatas removidas.</div>` : ''}

<div class="stats-row">
  <div class="stat-card"><div class="stat-value">${r.totalImported}</div><div class="stat-label">Total importado</div></div>
  <div class="stat-card red"><div class="stat-value">${r.duplicates}</div><div class="stat-label">Duplicatas marcadas</div></div>
  <div class="stat-card green"><div class="stat-value">${r.afterDedup}</div><div class="stat-label">Para triagem</div></div>
</div>

<div class="card mb-16">
  <div class="card-header">
    <span class="card-title">Adicionar Duplicata Manualmente</span>
  </div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label>ID do Registro Duplicado</label>
        <input type="text" id="dup-id" placeholder="ID do registro a marcar como duplicata">
      </div>
      <div class="form-group">
        <label>Motivo</label>
        <input type="text" id="dup-reason" placeholder="Ex: Mesmo DOI; mesmo título em bases diferentes" value="Identificado manualmente">
      </div>
    </div>
    <button class="btn btn-sm btn-warning mt-8" onclick="markManualDup()">Marcar como Duplicata</button>
  </div>
</div>

${dups.length > 0 ? `
<div class="card">
  <div class="card-header">
    <span class="card-title">Registros Marcados como Duplicata (${dups.length})</span>
    <button class="btn btn-sm btn-ghost" onclick="clearAllDups()">Limpar todas</button>
  </div>
  <div class="card-body" style="padding:0">
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Título</th><th>Base</th><th>Motivo</th><th></th></tr></thead>
        <tbody>
          ${dups.map(r => {
            const db = S.databases.find(d => d.id === r.sourceDatabase);
            return `<tr>
              <td class="td-mono">${r.id.slice(-6)}</td>
              <td class="td-truncate">${esc(r.title)}</td>
              <td><span class="badge badge-slate">${esc(db?.acronym || db?.name || '—')}</span></td>
              <td class="text-sm text-muted">${esc(r.duplicateReason)}</td>
              <td><button class="btn btn-sm btn-ghost" onclick="unmarkDup('${r.id}')">↩ Restaurar</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>` : `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Nenhuma duplicata marcada</div><div class="empty-text">Use a detecção automática ou adicione manualmente.</div></div>`}
`;
}

function runAutoDeduplicate() {
  const active = S.records.filter(r => !r.isDuplicate);
  let found = 0;
  const seen = new Map();
  const newDups = [];

  active.forEach(r => {
    // DOI match
    if (r.doi && r.doi.length > 5) {
      if (seen.has('doi:' + r.doi)) {
        newDups.push({ id: r.id, reason: 'DOI duplicado: ' + r.doi, of: seen.get('doi:' + r.doi) });
      } else { seen.set('doi:' + r.doi, r.id); }
    }
  });

  // Title similarity (Jaccard ≥ 0.85)
  const notYetDup = active.filter(r => !newDups.find(d => d.id === r.id));
  for (let i = 0; i < notYetDup.length; i++) {
    for (let j = i + 1; j < notYetDup.length; j++) {
      const sim = similarity(notYetDup[i].title, notYetDup[j].title);
      if (sim >= 0.85) {
        if (!newDups.find(d => d.id === notYetDup[j].id)) {
          newDups.push({ id: notYetDup[j].id, reason: `Título similar (${Math.round(sim*100)}%)`, of: notYetDup[i].id });
        }
      }
    }
  }

  newDups.forEach(d => {
    const r = S.records.find(x => x.id === d.id);
    if (r) { r.isDuplicate = true; r.duplicateOf = d.of; r.duplicateReason = d.reason; found++; }
  });

  if (found > 0) {
    audit('dedup', `Detecção automática: ${found} duplicatas encontradas`);
    saveState();
    toast(`${found} duplicatas detectadas`, 'success');
  } else {
    toast('Nenhuma duplicata adicional encontrada', 'info');
  }
  renderDeduplication();
}

function markManualDup() {
  const shortId = el('dup-id').value.trim();
  const reason = el('dup-reason').value.trim() || 'Marcado manualmente';
  const rec = S.records.find(r => r.id.endsWith(shortId) || r.id === shortId);
  if (!rec) { toast('Registro não encontrado pelo ID', 'error'); return; }
  rec.isDuplicate = true;
  rec.duplicateReason = reason;
  audit('dedup', `Duplicata marcada manualmente: ${rec.title.slice(0,40)}`, { reason });
  saveState();
  toast('Marcado como duplicata', 'success');
  renderDeduplication();
}

function unmarkDup(id) {
  const r = S.records.find(x => x.id === id);
  if (r) { r.isDuplicate = false; r.duplicateOf = null; r.duplicateReason = ''; }
  audit('dedup', `Duplicata restaurada: ${r?.title?.slice(0,40)}`);
  saveState();
  renderDeduplication();
}

function clearAllDups() {
  if (!confirm('Desmarcar todas as duplicatas?')) return;
  S.records.forEach(r => { r.isDuplicate = false; r.duplicateOf = null; r.duplicateReason = ''; });
  audit('dedup', 'Todas as duplicatas desmarcadas');
  saveState();
  renderDeduplication();
}

function completeDeduplication() {
  S.phases.deduplication.completed = true;
  S.phases.deduplication.completedAt = now();
  audit('phase', 'Deduplicação concluída', { duplicates: S.records.filter(r => r.isDuplicate).length });
  saveState();
  toast('Deduplicação concluída!', 'success');
  renderDeduplication();
}

// ── VIEW: SCREENING ──────────────────────────────────────────
let screenFilter = 'pending';

function renderScreening() {
  // normaliza registros antigos sem campos esperados
  S.records.forEach(r => {
    if (!r.screening) r.screening = { decision: 'pending', criteria: [], note: '', decidedAt: null };
    if (!Array.isArray(r.screening.criteria)) r.screening.criteria = [];
    if (!r.eligibility) r.eligibility = { decision: 'pending', criteria: [], note: '', notRetrieved: false, decidedAt: null };
    if (!Array.isArray(r.eligibility.criteria)) r.eligibility.criteria = [];
    if (!r.extraction) r.extraction = { completed: false, completedAt: null, data: {} };
  });
  const active = S.records.filter(r => !r.isDuplicate);
  const pending  = active.filter(r => !r.screening.decision || r.screening.decision === 'pending');
  const included = active.filter(r => r.screening.decision === 'included');
  const excluded = active.filter(r => r.screening.decision === 'excluded');
  const total = active.length;
  const done = included.length + excluded.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const phase = S.phases.screening;
  const excCrit = S.criteria.exclusion;

  const filtered = screenFilter === 'pending' ? pending : screenFilter === 'included' ? included : excluded;

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Triagem — Título e Resumo</div>
    <div class="section-subtitle">Avalie cada registro com base no título e resumo, aplicando os critérios de inclusão/exclusão do protocolo.</div>
  </div>
  ${!phase.completed && pending.length === 0 && total > 0 ?
    `<button class="btn btn-success" onclick="completeScreening()">✅ Concluir Triagem</button>` : ''}
</div>

${phase.completed ? `<div class="phase-banner complete">✅ Triagem concluída em ${fmtDate(phase.completedAt)}. ${included.length} incluídos, ${excluded.length} excluídos.</div>` : ''}

<div class="stats-row">
  <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Para triagem</div></div>
  <div class="stat-card amber"><div class="stat-value">${pending.length}</div><div class="stat-label">Pendentes</div></div>
  <div class="stat-card green"><div class="stat-value">${included.length}</div><div class="stat-label">Incluídos</div></div>
  <div class="stat-card red"><div class="stat-value">${excluded.length}</div><div class="stat-label">Excluídos</div></div>
</div>

<div class="progress-bar-wrap" style="margin-bottom:16px">
  <div class="progress-bar-fill ${pct===100?'green':''}" style="width:${pct}%"></div>
</div>
<div class="text-sm text-muted mb-16">${done}/${total} avaliados (${pct}%)</div>

<div class="card mb-16">
  <div class="card-body" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <strong>Filtro:</strong>
    ${['pending','included','excluded'].map(f => `
      <button class="btn btn-sm ${screenFilter===f?'btn-primary':'btn-ghost'}" onclick="setScreenFilter('${f}')">
        ${f==='pending'?'⏳ Pendentes':f==='included'?'✅ Incluídos':'❌ Excluídos'}
        (${f==='pending'?pending.length:f==='included'?included.length:excluded.length})
      </button>`).join('')}
    <div style="flex:1"></div>
    <input type="text" id="screen-search" placeholder="Buscar título…" style="max-width:220px" oninput="renderScreening()">
  </div>
</div>

${!total ? `<div class="phase-banner locked">⚠️ Importe registros e conclua a deduplicação antes de triar.</div>` :
!filtered.length ? `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Nenhum registro nesta categoria</div></div>` :
filtered.filter(r => {
  const q = el('screen-search')?.value?.toLowerCase() || '';
  return !q || r.title.toLowerCase().includes(q) || (r.abstract||'').toLowerCase().includes(q);
}).map(r => renderScreeningCard(r, excCrit)).join('')
}

<div class="keyboard-hint">
  <span><kbd>I</kbd> Incluir</span>
  <span><kbd>E</kbd> Excluir</span>
  <span><kbd>↑↓</kbd> Navegar</span>
</div>
`;
}

function renderScreeningCard(r, excCrit) {
  const decision = r.screening.decision;
  const cls = decision === 'included' ? 'included' : decision === 'excluded' ? 'excluded' : 'pending';
  const db = S.databases.find(d => d.id === r.sourceDatabase);
  return `
<div class="screening-card ${cls}" id="sc-${r.id}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
    <div style="flex:1">
      <div class="screening-title">${esc(r.title)}</div>
      <div class="screening-meta">
        ${esc(r.authors || '—')} · ${esc(r.year || '?')} · ${esc(r.journal || '—')}
        ${db ? `· <span class="badge badge-slate">${esc(db.acronym || db.name)}</span>` : ''}
        ${r.doi ? `· <span class="td-mono">${esc(r.doi)}</span>` : ''}
      </div>
      ${r.abstract ? `
        <div class="screening-abstract" id="abs-${r.id}">${esc(r.abstract)}</div>
        <div class="expand-toggle" onclick="toggleAbstract('${r.id}')">▼ Ver resumo completo</div>
      ` : '<div class="text-sm text-muted mb-8">Sem resumo disponível</div>'}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
      ${decision === 'included' ? '<span class="badge badge-green">✓ Incluído</span>' :
        decision === 'excluded' ? '<span class="badge badge-red">✕ Excluído</span>' :
        '<span class="badge badge-amber">⏳ Pendente</span>'}
      ${r.screening.decidedAt ? `<span class="text-sm text-muted">${fmtDate(r.screening.decidedAt)}</span>` : ''}
    </div>
  </div>
  <div class="screening-actions">
    <button class="btn btn-sm btn-success" onclick="screenDecide('${r.id}','included')">✓ Incluir</button>
    <select id="excl-crit-${r.id}" style="font-size:12px;padding:4px 8px">
      <option value="">Critério de exclusão…</option>
      ${excCrit.map((c,i) => `<option value="${c.id}">E${i+1}: ${esc(c.text.slice(0,50))}</option>`).join('')}
      <option value="__other__">Outro motivo</option>
    </select>
    <button class="btn btn-sm btn-danger" onclick="screenDecide('${r.id}','excluded')">✕ Excluir</button>
    ${decision !== 'pending' ? `<button class="btn btn-sm btn-ghost" onclick="screenDecide('${r.id}','pending')">↩ Reverter</button>` : ''}
    <input type="text" id="note-${r.id}" placeholder="Nota (opcional)" value="${esc(r.screening.note)}" style="flex:1;min-width:120px;font-size:12px" onchange="saveScreenNote('${r.id}',this.value)">
  </div>
  ${r.screening.criteria?.length ? `<div class="mt-4">${r.screening.criteria.map(cid => {
    const c = S.criteria.exclusion.find(x => x.id === cid);
    const idx = S.criteria.exclusion.indexOf(c);
    return `<span class="criteria-tag excl">E${idx+1}: ${esc((c?.text||cid).slice(0,40))}</span>`;
  }).join('')}</div>` : ''}
</div>`;
}

function setScreenFilter(f) { screenFilter = f; renderScreening(); }

function toggleAbstract(id) {
  const abs = el(`abs-${id}`);
  const tog = abs?.nextElementSibling;
  if (!abs) return;
  abs.classList.toggle('expanded');
  if (tog) tog.textContent = abs.classList.contains('expanded') ? '▲ Recolher resumo' : '▼ Ver resumo completo';
}

function screenDecide(id, decision) {
  const rec = S.records.find(r => r.id === id);
  if (!rec) return;
  const prev = rec.screening.decision;
  rec.screening.decision = decision;
  rec.screening.decidedAt = decision !== 'pending' ? now() : null;
  if (decision === 'excluded') {
    const sel = el(`excl-crit-${id}`);
    const cid = sel?.value;
    if (!Array.isArray(rec.screening.criteria)) rec.screening.criteria = [];
    if (cid && !rec.screening.criteria.includes(cid)) rec.screening.criteria.push(cid);
  }
  if (decision === 'pending') { rec.screening.criteria = []; }
  audit('screening', `Triagem: ${decision} — ${rec.title.slice(0,50)}`, { decision, prev, criteria: rec.screening.criteria });
  saveState();
  renderScreening();
}

function saveScreenNote(id, note) {
  const rec = S.records.find(r => r.id === id);
  if (rec) { rec.screening.note = note; autoSave(); }
}

function completeScreening() {
  S.phases.screening.completed = true;
  S.phases.screening.completedAt = now();
  const inc = S.records.filter(r => !r.isDuplicate && r.screening.decision === 'included').length;
  audit('phase', 'Triagem concluída', { included: inc });
  saveState();
  toast('Triagem concluída!', 'success');
  renderScreening();
}

// ── VIEW: ELIGIBILITY ────────────────────────────────────────
let eligFilter = 'pending';

function renderEligibility() {
  const eligible = S.records.filter(r => !r.isDuplicate && r.screening.decision === 'included');
  const pending   = eligible.filter(r => !r.eligibility.decision || r.eligibility.decision === 'pending');
  const included  = eligible.filter(r => r.eligibility.decision === 'included');
  const excluded  = eligible.filter(r => r.eligibility.decision === 'excluded');
  const notRetrieved = eligible.filter(r => r.eligibility.notRetrieved);
  const total = eligible.length;
  const done = included.length + excluded.length + notRetrieved.filter(r => r.eligibility.decision !== 'pending').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const phase = S.phases.eligibility;
  const excCrit = S.criteria.exclusion;
  const filtered = eligFilter === 'pending' ? pending : eligFilter === 'included' ? included : eligFilter === 'excluded' ? excluded : notRetrieved;

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Elegibilidade — Texto Completo</div>
    <div class="section-subtitle">Avalie os textos completos dos estudos pré-selecionados na triagem.</div>
  </div>
  ${!phase.completed && pending.length === 0 && total > 0 ?
    `<button class="btn btn-success" onclick="completeEligibility()">✅ Concluir Elegibilidade</button>` : ''}
</div>

${phase.completed ? `<div class="phase-banner complete">✅ Elegibilidade concluída em ${fmtDate(phase.completedAt)}. ${included.length} incluídos.</div>` : ''}

<div class="stats-row">
  <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Para avaliar</div></div>
  <div class="stat-card amber"><div class="stat-value">${pending.length}</div><div class="stat-label">Pendentes</div></div>
  <div class="stat-card green"><div class="stat-value">${included.length}</div><div class="stat-label">Incluídos</div></div>
  <div class="stat-card red"><div class="stat-value">${excluded.length}</div><div class="stat-label">Excluídos (TC)</div></div>
  <div class="stat-card slate"><div class="stat-value">${notRetrieved.length}</div><div class="stat-label">TC não obtido</div></div>
</div>

<div class="progress-bar-wrap mb-16">
  <div class="progress-bar-fill ${pct===100?'green':''}" style="width:${pct}%"></div>
</div>
<div class="text-sm text-muted mb-16">${done}/${total} avaliados (${pct}%)</div>

<div class="card mb-16">
  <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${['pending','included','excluded','not-retrieved'].map(f => {
      const cnt = f==='pending'?pending.length:f==='included'?included.length:f==='excluded'?excluded.length:notRetrieved.length;
      const lbl = {pending:'⏳ Pendentes',included:'✅ Incluídos',excluded:'❌ Excluídos','not-retrieved':'🔒 TC não obtido'}[f];
      return `<button class="btn btn-sm ${eligFilter===f?'btn-primary':'btn-ghost'}" onclick="setEligFilter('${f}')">${lbl} (${cnt})</button>`;
    }).join('')}
  </div>
</div>

${!total ? `<div class="phase-banner locked">⚠️ Conclua a triagem primeiro para que os estudos incluídos apareçam aqui.</div>` :
!filtered.length ? `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Nenhum registro nesta categoria</div></div>` :
filtered.map(r => renderEligibilityCard(r, excCrit)).join('')}
`;
}

function renderEligibilityCard(r, excCrit) {
  const dec = r.eligibility.decision;
  const cls = dec === 'included' ? 'included' : dec === 'excluded' ? 'excluded' : 'pending';
  const db = S.databases.find(d => d.id === r.sourceDatabase);
  return `
<div class="screening-card ${cls}" id="elig-${r.id}">
  <div style="display:flex;justify-content:space-between;gap:12px">
    <div style="flex:1">
      <div class="screening-title">${esc(r.title)}</div>
      <div class="screening-meta">${esc(r.authors||'—')} · ${esc(r.year||'?')} · ${db?`<span class="badge badge-slate">${esc(db.acronym||db.name)}</span>`:''}</div>
      ${r.doi ? `<div class="td-mono mt-4">${esc(r.doi)}</div>` : ''}
      ${r.url  ? `<div class="text-sm mt-4"><a href="${esc(r.url)}" target="_blank">🔗 Acessar</a></div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
      ${dec==='included'?'<span class="badge badge-green">✓ Incluído</span>':dec==='excluded'?'<span class="badge badge-red">✕ Excluído</span>':r.eligibility.notRetrieved?'<span class="badge badge-slate">TC Não obtido</span>':'<span class="badge badge-amber">⏳ Pendente</span>'}
    </div>
  </div>
  <div class="screening-actions mt-8">
    <button class="btn btn-sm btn-success" onclick="eligDecide('${r.id}','included')">✓ Incluir</button>
    <select id="elig-crit-${r.id}" style="font-size:12px;padding:4px 8px">
      <option value="">Critério de exclusão…</option>
      ${excCrit.map((c,i)=>`<option value="${c.id}">E${i+1}: ${esc(c.text.slice(0,50))}</option>`).join('')}
      <option value="__other__">Outro</option>
    </select>
    <button class="btn btn-sm btn-danger" onclick="eligDecide('${r.id}','excluded')">✕ Excluir (TC)</button>
    <button class="btn btn-sm btn-ghost" onclick="eligNotRetrieved('${r.id}')">🔒 TC não obtido</button>
    ${dec !== 'pending' ? `<button class="btn btn-sm btn-ghost" onclick="eligDecide('${r.id}','pending')">↩ Reverter</button>` : ''}
  </div>
  <div class="mt-4">
    <input type="text" placeholder="Nota / justificativa…" value="${esc(r.eligibility.note)}" style="font-size:12px;width:100%" onchange="saveEligNote('${r.id}',this.value)">
  </div>
  ${r.eligibility.criteria?.length ? `<div class="mt-4">${r.eligibility.criteria.map(cid=>{
    const c=S.criteria.exclusion.find(x=>x.id===cid); const idx=S.criteria.exclusion.indexOf(c);
    return `<span class="criteria-tag excl">E${idx+1}: ${esc((c?.text||cid).slice(0,40))}</span>`;
  }).join('')}</div>` : ''}
</div>`;
}

function setEligFilter(f) { eligFilter = f; renderEligibility(); }

function eligDecide(id, decision) {
  const rec = S.records.find(r => r.id === id);
  if (!rec) return;
  rec.eligibility.decision = decision;
  rec.eligibility.notRetrieved = false;
  rec.eligibility.decidedAt = decision !== 'pending' ? now() : null;
  if (decision === 'excluded') {
    if (!Array.isArray(rec.eligibility.criteria)) rec.eligibility.criteria = [];
    const sel = el(`elig-crit-${id}`);
    const cid = sel?.value;
    if (cid && !rec.eligibility.criteria.includes(cid)) rec.eligibility.criteria.push(cid);
  }
  if (decision === 'pending') { rec.eligibility.criteria = []; }
  audit('eligibility', `Elegibilidade: ${decision} — ${rec.title.slice(0,50)}`, { decision });
  saveState();
  renderEligibility();
}

function eligNotRetrieved(id) {
  const rec = S.records.find(r => r.id === id);
  if (!rec) return;
  rec.eligibility.notRetrieved = true;
  rec.eligibility.decision = 'excluded';
  rec.eligibility.decidedAt = now();
  if (!Array.isArray(rec.eligibility.criteria)) rec.eligibility.criteria = [];
  if (!rec.eligibility.criteria.includes('__not_retrieved__')) rec.eligibility.criteria.push('__not_retrieved__');
  audit('eligibility', `Texto completo não obtido: ${rec.title.slice(0,50)}`);
  saveState();
  renderEligibility();
}

function saveEligNote(id, note) {
  const rec = S.records.find(r => r.id === id);
  if (rec) { rec.eligibility.note = note; autoSave(); }
}

function completeEligibility() {
  S.phases.eligibility.completed = true;
  S.phases.eligibility.completedAt = now();
  const inc = S.records.filter(r => r.eligibility.decision === 'included').length;
  audit('phase', 'Elegibilidade concluída', { included: inc });
  saveState();
  toast('Elegibilidade concluída!', 'success');
  renderEligibility();
}

// ── VIEW: EXTRACTION ─────────────────────────────────────────
let extractionCurrent = null;

function renderExtraction() {
  const included = S.records.filter(r => r.eligibility.decision === 'included');
  const done = included.filter(r => r.extraction.completed).length;
  const total = included.length;

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Extração de Dados — Charting</div>
    <div class="section-subtitle">Extraia dados dos estudos incluídos. Os campos foram definidos no protocolo.</div>
  </div>
  ${done === total && total > 0 ? `<button class="btn btn-success" onclick="completeExtraction()">✅ Concluir Extração</button>` : ''}
</div>

<div class="stats-row">
  <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Estudos incluídos</div></div>
  <div class="stat-card green"><div class="stat-value">${done}</div><div class="stat-label">Extraídos</div></div>
  <div class="stat-card amber"><div class="stat-value">${total - done}</div><div class="stat-label">Pendentes</div></div>
</div>

${!total ? `<div class="phase-banner locked">⚠️ Conclua a elegibilidade primeiro.</div>` :
`<div class="table-wrap">
  <table>
    <thead><tr><th>Título</th><th>Autores</th><th>Ano</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${included.map(r => `<tr>
        <td class="td-title td-truncate">${esc(r.title)}</td>
        <td class="td-muted text-sm">${esc((r.authors||'').split(',')[0])} et al.</td>
        <td>${esc(r.year||'—')}</td>
        <td>${r.extraction.completed ? '<span class="badge badge-green">✓ Concluído</span>' : '<span class="badge badge-amber">Pendente</span>'}</td>
        <td><button class="btn btn-sm btn-primary" onclick="openExtractionForm('${r.id}')">📊 ${r.extraction.completed?'Editar':'Preencher'}</button></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`}
`;
}

function openExtractionForm(id) {
  const rec = S.records.find(r => r.id === id);
  if (!rec) return;
  extractionCurrent = id;
  const fields = S.extractionFields;
  const data = rec.extraction.data || {};

  openModal(
    `Extração: ${rec.title.slice(0, 60)}…`,
    `<div class="form-grid">
      ${fields.map(f => `
        <div class="form-group" style="${f.type==='textarea'?'grid-column:span 2':''}">
          <label>${esc(f.label)}${f.required?'<span class="req"> *</span>':''}</label>
          ${f.type === 'textarea'
            ? `<textarea id="ef-${f.id}" rows="3">${esc(data[f.id]||'')}</textarea>`
            : `<input type="${f.type==='number'?'number':'text'}" id="ef-${f.id}" value="${esc(data[f.id]||'')}">`}
        </div>`).join('')}
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveExtraction()">💾 Salvar Extração</button>`
  );
}

function saveExtraction() {
  const rec = S.records.find(r => r.id === extractionCurrent);
  if (!rec) return;
  const data = {};
  S.extractionFields.forEach(f => {
    const input = el(`ef-${f.id}`);
    if (input) data[f.id] = input.value.trim();
  });
  rec.extraction.data = data;
  rec.extraction.completed = true;
  rec.extraction.completedAt = now();
  audit('extraction', `Extração concluída: ${rec.title.slice(0,50)}`);
  saveState();
  closeModal();
  toast('Extração salva!', 'success');
  renderExtraction();
}

function completeExtraction() {
  S.phases.extraction.completed = true;
  S.phases.extraction.completedAt = now();
  audit('phase', 'Extração de dados concluída');
  saveState();
  toast('Extração concluída!', 'success');
  renderExtraction();
}

// ── VIEW: QUALITATIVE ────────────────────────────────────────
function renderQualitative() {
  const included = S.records.filter(r => r.eligibility.decision === 'included');
  const cqs = S.competenceQuestions;

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Análise Qualitativa — Competence Questions</div>
    <div class="section-subtitle">Responda às competence questions com base nos dados extraídos dos estudos incluídos. Cite os estudos relevantes para cada resposta.</div>
  </div>
  <button class="btn btn-primary" onclick="saveAllCQs()">💾 Salvar Respostas</button>
</div>

${!included.length ? `<div class="phase-banner locked">⚠️ Nenhum estudo incluído ainda. Conclua a fase de elegibilidade.</div>` : ''}
${!cqs.length ? `<div class="phase-banner locked">⚠️ Nenhuma Competence Question cadastrada. Adicione no Protocolo.</div>` : ''}

${cqs.map((cq, i) => `
<div class="cq-card">
  <div class="cq-header">
    <span class="cq-num">CQ${i+1}</span>
    <span class="cq-question">${esc(cq.question)}</span>
  </div>
  <div class="cq-body">
    <div class="form-group mb-12">
      <label>Resposta Síntese</label>
      <textarea id="cq-answer-${cq.id}" rows="5" placeholder="Escreva a síntese da resposta a esta competence question com base nos estudos incluídos…">${esc(cq.answer)}</textarea>
    </div>
    <div class="form-group">
      <label>Estudos que embasam esta resposta</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
        ${included.map(r => {
          const cited = (cq.citations||[]).includes(r.id);
          return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;background:${cited?'var(--blue-50)':'var(--slate-50)'};border:1px solid ${cited?'var(--blue-200)':'var(--slate-200)'};border-radius:4px;padding:3px 8px">
            <input type="checkbox" ${cited?'checked':''} onchange="toggleCitation('${cq.id}','${r.id}',this.checked)">
            ${esc(r.authors?.split(',')[0]||'?')} (${esc(r.year||'?')})
          </label>`;
        }).join('')}
      </div>
    </div>
  </div>
</div>`).join('')}
`;
}

function toggleCitation(cqId, recId, checked) {
  const cq = S.competenceQuestions.find(x => x.id === cqId);
  if (!cq) return;
  if (!cq.citations) cq.citations = [];
  if (checked) { if (!cq.citations.includes(recId)) cq.citations.push(recId); }
  else { cq.citations = cq.citations.filter(x => x !== recId); }
  markDirty();
}

function saveAllCQs() {
  S.competenceQuestions.forEach(cq => {
    const inp = el(`cq-answer-${cq.id}`);
    if (inp) cq.answer = inp.value;
  });
  audit('qualitative', 'Respostas das CQs atualizadas', { count: S.competenceQuestions.length });
  saveState();
  toast('Respostas salvas!', 'success');
}

// ── VIEW: PRISMA FLOW ────────────────────────────────────────
function renderPrisma() {
  const p = calcPrisma();
  const crit = S.criteria;

  function criterionLabel(id) {
    if (id === '__other__') return 'Outro motivo';
    if (id === '__not_retrieved__') return 'Texto completo não obtido';
    const c = [...crit.inclusion, ...crit.exclusion].find(x => x.id === id);
    return c ? c.text.slice(0, 60) : id;
  }

  const screenExclRows = Object.entries(p.screenExclByCriteria)
    .map(([cid, n]) => `• ${criterionLabel(cid)}: n=${n}`).join('\n') || 'Nenhuma';

  const eligExclRows = Object.entries(p.eligExclByCriteria)
    .map(([cid, n]) => `• ${criterionLabel(cid)}: n=${n}`).join('\n') || 'Nenhuma';

  const dbRows = Object.values(p.dbBreakdown)
    .map(d => `${d.name}: n=${d.count}`).join('\n') || 'Nenhuma base';

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Fluxograma PRISMA-ScR</div>
    <div class="section-subtitle">Gerado automaticamente com base nas decisões registradas.</div>
  </div>
  <button class="btn btn-primary" onclick="exportPrismaAsPNG()">🖼 Exportar PNG</button>
</div>

<div class="card mb-20" id="prisma-diagram-card">
  <div class="card-body" style="padding:24px">
    <div class="prisma-container">
      <div class="prisma-flow" id="prisma-flow-svg">

        <div class="prisma-section-label">IDENTIFICAÇÃO</div>

        <div class="prisma-row">
          <div class="prisma-box section-id">
            <div class="prisma-box-title">Registros identificados</div>
            <div class="prisma-box-num">N = ${p.totalImported}</div>
            <div class="prisma-box-label">por busca em bases de dados</div>
            <div class="prisma-box-sub">${Object.values(p.dbBreakdown).map(d=>`${d.name}: n=${d.count}`).join('<br>') || '—'}</div>
          </div>
          <div class="prisma-side-arrow"></div>
          <div class="prisma-side-box">
            <div class="prisma-side-box-title">Duplicatas removidas</div>
            <div class="prisma-side-box-num">N = ${p.duplicates}</div>
          </div>
        </div>

        <div class="prisma-arrow-down"></div>

        <div class="prisma-row">
          <div class="prisma-box section-id">
            <div class="prisma-box-title">Registros após remoção de duplicatas</div>
            <div class="prisma-box-num">N = ${p.afterDedup}</div>
          </div>
        </div>

        <div class="prisma-section-label">TRIAGEM</div>

        <div class="prisma-row">
          <div class="prisma-box section-scr">
            <div class="prisma-box-title">Registros triados (título/resumo)</div>
            <div class="prisma-box-num">N = ${p.afterDedup}</div>
          </div>
          <div class="prisma-side-arrow"></div>
          <div class="prisma-side-box">
            <div class="prisma-side-box-title">Excluídos na triagem</div>
            <div class="prisma-side-box-num">N = ${p.screeningExcluded}</div>
            <div class="prisma-side-box-reason">${Object.entries(p.screenExclByCriteria).map(([cid,n])=>`• ${criterionLabel(cid).slice(0,35)}: n=${n}`).join('<br>') || '—'}</div>
          </div>
        </div>

        <div class="prisma-section-label">ELEGIBILIDADE</div>

        <div class="prisma-row">
          <div class="prisma-box section-elig">
            <div class="prisma-box-title">Textos completos avaliados</div>
            <div class="prisma-box-num">N = ${p.screeningIncluded}</div>
          </div>
          <div class="prisma-side-arrow"></div>
          <div class="prisma-side-box">
            <div class="prisma-side-box-title">Excluídos (texto completo)</div>
            <div class="prisma-side-box-num">N = ${p.eligExcluded}</div>
            <div class="prisma-side-box-reason">${Object.entries(p.eligExclByCriteria).map(([cid,n])=>`• ${criterionLabel(cid).slice(0,35)}: n=${n}`).join('<br>') || '—'}</div>
          </div>
        </div>

        ${p.eligNotRetrieved > 0 ? `
        <div style="align-self:flex-start;margin-left:168px;display:flex;align-items:center;gap:8px;margin-top:8px">
          <div class="prisma-side-box" style="min-width:200px">
            <div class="prisma-side-box-title">Textos completos não obtidos</div>
            <div class="prisma-side-box-num">N = ${p.eligNotRetrieved}</div>
          </div>
        </div>` : ''}

        <div class="prisma-section-label">INCLUÍDOS</div>

        <div class="prisma-row">
          <div class="prisma-box section-inc">
            <div class="prisma-box-title">Estudos incluídos na revisão</div>
            <div class="prisma-box-num">N = ${p.eligIncluded}</div>
            <div class="prisma-box-label">PRISMA-ScR Fluxograma</div>
          </div>
        </div>

      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="card-title">📋 Checklist PRISMA-ScR (22 itens)</span></div>
  <div class="card-body">
    ${renderPrismaChecklist()}
  </div>
</div>
`;
}

function renderPrismaChecklist() {
  const items = [
    { n:'1', sec:'Título', item:'Título', desc:'Identificar o relatório como revisão de escopo.' },
    { n:'2', sec:'Resumo', item:'Resumo estruturado', desc:'Fornecer um resumo estruturado.' },
    { n:'3', sec:'Introdução', item:'Justificativa', desc:'Descrever a justificativa em relação ao conhecimento existente.' },
    { n:'4', sec:'Introdução', item:'Objetivo', desc:'Formular o objetivo ou questão de pesquisa (PCC ou PICO).' },
    { n:'5', sec:'Métodos', item:'Protocolo e registro', desc:'Indicar se existe protocolo registrado e onde acessar.' },
    { n:'6', sec:'Métodos', item:'Critérios de elegibilidade', desc:'Especificar os critérios de inclusão e exclusão.' },
    { n:'7', sec:'Métodos', item:'Fontes de informação', desc:'Descrever todas as fontes de informação pesquisadas.' },
    { n:'8', sec:'Métodos', item:'Estratégia de busca', desc:'Apresentar a estratégia completa de busca para pelo menos uma fonte.' },
    { n:'9', sec:'Métodos', item:'Seleção das fontes de evidências', desc:'Declarar o processo de seleção (triagem/elegibilidade).' },
    { n:'10', sec:'Métodos', item:'Extração de dados', desc:'Descrever o método de extração de dados.' },
    { n:'11', sec:'Métodos', item:'Itens dos dados', desc:'Listar e definir todas as variáveis buscadas.' },
    { n:'12', sec:'Métodos', item:'Avaliação de risco de viés', desc:'(Se realizado) Descrever os métodos usados.' },
    { n:'13', sec:'Métodos', item:'Síntese dos resultados', desc:'Descrever os métodos de síntese e apresentação.' },
    { n:'14', sec:'Resultados', item:'Seleção das fontes', desc:'Informar o número de fontes triadas, avaliadas e incluídas, com razões de exclusão (diagrama de fluxo).' },
    { n:'15', sec:'Resultados', item:'Características das fontes', desc:'Apresentar características de cada fonte incluída.' },
    { n:'16', sec:'Resultados', item:'Avaliação crítica', desc:'(Se realizado) Apresentar avaliação do risco de viés.' },
    { n:'17', sec:'Resultados', item:'Resultados de fontes individuais', desc:'Apresentar dados de cada fonte incluída.' },
    { n:'18', sec:'Resultados', item:'Síntese dos resultados', desc:'Sumarizar e/ou apresentar os resultados.' },
    { n:'19', sec:'Discussão', item:'Limitações', desc:'Discutir as limitações da revisão.' },
    { n:'20', sec:'Discussão', item:'Conclusões', desc:'Interpretar os resultados e tirar conclusões gerais.' },
    { n:'21', sec:'Financiamento', item:'Financiamento', desc:'Descrever as fontes de financiamento.' },
    { n:'22', sec:'Específico ScR', item:'Limitações das evidências', desc:'(ScR) Discutir limitações das evidências incluídas.' }
  ];

  const bySection = {};
  items.forEach(it => { if (!bySection[it.sec]) bySection[it.sec] = []; bySection[it.sec].push(it); });

  return Object.entries(bySection).map(([sec, its]) => `
    <div class="mb-12">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--slate-400);margin-bottom:6px">${esc(sec)}</div>
      ${its.map(it => `
        <div class="checklist-item">
          <span class="checklist-num">${it.n}</span>
          <div>
            <strong>${esc(it.item)}</strong>
            <div class="text-sm text-muted">${esc(it.desc)}</div>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function exportPrismaAsPNG() {
  toast('Para exportar: use Ctrl+P → Imprimir como PDF ou faça screenshot do diagrama.', 'info', 5000);
}

// ── VIEW: AUDIT LOG ──────────────────────────────────────────
function renderAudit() {
  const log = S.auditLog;
  const catIcons = { import:'📥', dedup:'🔍', screening:'🔬', eligibility:'📄', extraction:'📊', qualitative:'💬', protocol:'📋', db:'🗄', system:'⚙️', phase:'✅', delete:'🗑' };

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Log de Auditoria</div>
    <div class="section-subtitle">Registro completo e imutável de todas as ações realizadas na revisão.</div>
  </div>
  <div class="btn-group">
    <button class="btn btn-ghost" onclick="exportAuditCSV()">📥 Exportar CSV</button>
    <button class="btn btn-ghost" onclick="renderAudit()">🔄 Atualizar</button>
  </div>
</div>

<div class="card mb-16">
  <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">
    <input type="text" id="audit-search" placeholder="Filtrar por texto…" style="max-width:250px" oninput="renderAuditTable()">
    <select id="audit-cat" onchange="renderAuditTable()">
      <option value="">Todas as categorias</option>
      ${[...new Set(log.map(e=>e.category))].map(c=>`<option value="${c}">${catIcons[c]||''} ${c}</option>`).join('')}
    </select>
    <span class="text-sm text-muted" style="padding:8px 4px">${log.length} entradas</span>
  </div>
</div>

<div class="card">
  <div class="card-body" style="padding:0" id="audit-table-wrap">
  </div>
</div>
`;
  renderAuditTable();
}

function renderAuditTable() {
  const search = (el('audit-search')?.value||'').toLowerCase();
  const cat    = el('audit-cat')?.value || '';
  const catIcons = { import:'📥', dedup:'🔍', screening:'🔬', eligibility:'📄', extraction:'📊', qualitative:'💬', protocol:'📋', db:'🗄', system:'⚙️', phase:'✅', delete:'🗑' };
  const filtered = S.auditLog.filter(e =>
    (!cat || e.category === cat) &&
    (!search || e.action.toLowerCase().includes(search) || JSON.stringify(e.details).toLowerCase().includes(search))
  );

  const wrap = el('audit-table-wrap');
  if (!wrap) return;
  if (!filtered.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma entrada encontrada</div></div>'; return; }

  wrap.innerHTML = `<div style="padding:0 16px">` +
    filtered.map(e => `
      <div class="audit-entry">
        <span class="audit-time">${fmtDate(e.ts)}</span>
        <span class="audit-icon">${catIcons[e.category]||'ℹ️'}</span>
        <div>
          <div class="audit-text">${esc(e.action)}</div>
          ${Object.keys(e.details||{}).length ? `<div class="audit-detail">${esc(JSON.stringify(e.details))}</div>` : ''}
        </div>
      </div>`).join('') + `</div>`;
}

function exportAuditCSV() {
  const rows = [['Data/Hora','Categoria','Ação','Detalhes']];
  S.auditLog.forEach(e => rows.push([fmtDate(e.ts), e.category, e.action, JSON.stringify(e.details||{})]));
  downloadCSV(rows, 'audit_log.csv');
}

// ── VIEW: REPORT ─────────────────────────────────────────────
function renderReport() {
  const p = calcPrisma();
  const included = S.records.filter(r => r.eligibility.decision === 'included');

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Relatórios e Exportação</div>
    <div class="section-subtitle">Exporte dados e relatórios da revisão de escopo.</div>
  </div>
</div>

<div class="stats-row">
  <div class="stat-card"><div class="stat-value">${p.totalImported}</div><div class="stat-label">Total importado</div></div>
  <div class="stat-card red"><div class="stat-value">${p.duplicates}</div><div class="stat-label">Duplicatas</div></div>
  <div class="stat-card amber"><div class="stat-value">${p.screeningExcluded}</div><div class="stat-label">Excluídos triagem</div></div>
  <div class="stat-card amber"><div class="stat-value">${p.eligExcluded}</div><div class="stat-label">Excluídos TC</div></div>
  <div class="stat-card green"><div class="stat-value">${p.eligIncluded}</div><div class="stat-label">Incluídos</div></div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div class="card">
    <div class="card-header"><span class="card-title">📋 Protocolo</span></div>
    <div class="card-body">
      <div class="report-section">
        <div class="report-item"><span class="report-item-key">Título</span><span class="report-item-val">${esc(S.project.title)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Questão de pesquisa</span><span class="report-item-val">${esc(S.project.researchQuestion)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Population (P)</span><span class="report-item-val">${esc(S.project.pcc.population)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Concept (C)</span><span class="report-item-val">${esc(S.project.pcc.concept)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Context (C)</span><span class="report-item-val">${esc(S.project.pcc.context)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Registro</span><span class="report-item-val">${esc(S.project.protocolRegistration)||'—'}</span></div>
        <div class="report-item"><span class="report-item-key">Início</span><span class="report-item-val">${fmtDateShort(S.project.startDate)}</span></div>
      </div>
      <div class="report-section">
        <h3>Critérios de Inclusão</h3>
        ${S.criteria.inclusion.map((c,i)=>`<div class="report-item"><span class="report-item-key">I${i+1}</span><span class="report-item-val">${esc(c.text)}</span></div>`).join('') || '<div class="text-muted text-sm">Nenhum</div>'}
      </div>
      <div class="report-section">
        <h3>Critérios de Exclusão</h3>
        ${S.criteria.exclusion.map((c,i)=>`<div class="report-item"><span class="report-item-key">E${i+1}</span><span class="report-item-val">${esc(c.text)}</span></div>`).join('') || '<div class="text-muted text-sm">Nenhum</div>'}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">🗄 Bases de Dados</span></div>
    <div class="card-body">
      ${S.databases.map(db=>`
        <div class="report-item" style="flex-direction:column;gap:4px">
          <strong>${esc(db.name)}</strong>
          <span class="text-sm text-muted">Busca em: ${fmtDateShort(db.searchDate)} · ${db.recordsFound??'?'} resultados</span>
          ${db.searchString ? `<details><summary class="text-sm" style="cursor:pointer">Ver string</summary><pre style="margin-top:6px;font-size:11px">${esc(db.searchString)}</pre></details>` : ''}
        </div>`).join('') || '<div class="text-muted text-sm">Nenhuma base</div>'}
    </div>
  </div>
</div>

<div class="card mt-16">
  <div class="card-header"><span class="card-title">📊 Exportações</span></div>
  <div class="card-body">
    <div class="btn-group">
      <button class="btn btn-primary" onclick="App.exportProject()">💾 Backup JSON (projeto completo)</button>
      <button class="btn btn-ghost" onclick="exportIncludedCSV()">📥 Estudos incluídos (CSV)</button>
      <button class="btn btn-ghost" onclick="exportAllRecordsCSV()">📥 Todos os registros (CSV)</button>
      <button class="btn btn-ghost" onclick="exportExtractionCSV()">📥 Dados extraídos (CSV)</button>
      <button class="btn btn-ghost" onclick="exportAuditCSV()">📥 Log de auditoria (CSV)</button>
    </div>
  </div>
</div>

${included.length ? `
<div class="card mt-16">
  <div class="card-header"><span class="card-title">✅ Estudos Incluídos (${included.length})</span></div>
  <div class="card-body" style="padding:0">
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Título</th><th>Autores</th><th>Ano</th><th>Periódico</th><th>DOI</th></tr></thead>
        <tbody>
          ${included.map((r,i)=>`<tr>
            <td class="td-muted">${i+1}</td>
            <td class="td-title" style="max-width:280px">${esc(r.title)}</td>
            <td class="td-muted text-sm">${esc(r.authors||'—')}</td>
            <td>${esc(r.year||'—')}</td>
            <td class="text-sm">${esc(r.journal||'—')}</td>
            <td class="td-mono">${r.doi?`<a href="https://doi.org/${r.doi}" target="_blank">${esc(r.doi)}</a>`:'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>` : ''}
`;
}

function exportIncludedCSV() {
  const included = S.records.filter(r => r.eligibility.decision === 'included');
  const rows = [['Título','Autores','Ano','Periódico','DOI','Keywords','URL']];
  included.forEach(r => rows.push([r.title, r.authors, r.year, r.journal, r.doi, r.keywords, r.url]));
  downloadCSV(rows, 'estudos_incluidos.csv');
}

function exportAllRecordsCSV() {
  const rows = [['ID','Título','Autores','Ano','Base','Duplicata','Triagem','Critério Triagem','Elegibilidade','Critério Elegibilidade']];
  S.records.forEach(r => {
    const db = S.databases.find(d => d.id === r.sourceDatabase);
    rows.push([r.id, r.title, r.authors, r.year, db?.name||'', r.isDuplicate?'Sim':'Não', r.screening.decision, r.screening.criteria?.join(';'), r.eligibility.decision, r.eligibility.criteria?.join(';')]);
  });
  downloadCSV(rows, 'todos_registros.csv');
}

function exportExtractionCSV() {
  const included = S.records.filter(r => r.extraction.completed);
  if (!included.length) { toast('Nenhuma extração concluída', 'warning'); return; }
  const fields = S.extractionFields;
  const headers = ['Título', 'Autores', 'Ano', ...fields.map(f => f.label)];
  const rows = [headers];
  included.forEach(r => rows.push([r.title, r.authors, r.year, ...fields.map(f => r.extraction.data[f.id]||'')]));
  downloadCSV(rows, 'dados_extraidos.csv');
}

// ── CSV DOWNLOAD HELPER ──────────────────────────────────────
function downloadCSV(rows, filename) {
  const csvContent = rows.map(row =>
    row.map(cell => `"${String(cell||'').replace(/"/g,'""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── APP OBJECT (global actions) ──────────────────────────────
window.App = {
  exportProject() {
    const filename = `rsl_${(S.project.title||'projeto').replace(/\s+/g,'_').slice(0,30)}_${today()}.json`;
    downloadJSON(S, filename);
    audit('system', 'Projeto exportado', { filename });
    toast('Projeto exportado!', 'success');
  },
  importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.records) throw new Error('Arquivo inválido');
        if (!confirm('Importar este projeto? O projeto atual será substituído.')) return;
        S = data;
        audit('system', 'Projeto importado', { file: file.name });
        saveState();
        navigate(currentView);
        toast('Projeto importado!', 'success');
      } catch(err) {
        toast('Erro ao importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  },
  resetProject() {
    if (!confirm('Resetar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    if (!confirm('Confirme novamente: apagar tudo?')) return;
    idbDelete().then(() => {
      S = createState();
      saveState();
      navigate('protocol');
      toast('Projeto resetado.', 'warning');
    });
  }
};

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (currentView === 'screening') {
    const pending = S.records.filter(r => !r.isDuplicate && (!r.screening.decision || r.screening.decision === 'pending'));
    if (pending.length && screenFilter === 'pending') {
      const first = pending[0];
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); screenDecide(first.id, 'included'); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); screenDecide(first.id, 'excluded'); }
    }
  }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveState(); toast('Salvo!', 'success'); }
});

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  qsa('.nav-item[data-view]').forEach(li => {
    li.addEventListener('click', () => navigate(li.dataset.view));
  });
  navigate('protocol');
  audit('system', 'Sistema iniciado', { version: '1.0' });
  saveState();
  el('save-time').textContent = S.updatedAt ? fmtDate(S.updatedAt) : '';
});

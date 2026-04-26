'use strict';
// ============================================================
// RSL SYSTEM — Auto-Busca (PRISMA-ScR)
// Módulo de busca automática nas bases de dados científicas
// ============================================================

// ── CONFIGURAÇÃO DAS BASES ───────────────────────────────────
const AS_SOURCES = [
  // ─── TIER 1: API pública, sem chave ─────────────────────
  {
    key: 'dblp',
    name: 'DBLP',
    tier: 1,
    tagline: 'Bibligrafia de Computação · API pública · sem chave',
    color: '#4285f4',
    icon: '🔵',
    doFetch: asFetchDblp,
    buildUrl: (q, y1, y2) =>
      `https://dblp.org/search?q=${encodeURIComponent(q)}`
  },
  {
    key: 'openalex',
    name: 'OpenAlex',
    tier: 1,
    tagline: 'Catálogo global · API pública · chave gratuita opcional',
    color: '#0ea5e9',
    icon: '🔷',
    needsKey: true, keyParam: 'openalex', keyUrl: 'https://openalex.org/developers',
    keyHint: 'Opcional. Registre em openalex.org para maior limite.',
    doFetch: asFetchOpenAlex,
    buildUrl: (q, y1, y2) => {
      const base = `https://openalex.org/works?search=${encodeURIComponent(q)}`;
      return y1 ? base + `&filter=publication_year:${y1}-${y2||new Date().getFullYear()}` : base;
    }
  },
  {
    key: 'crossref',
    name: 'CrossRef',
    tier: 1,
    tagline: 'Metadados DOI · API pública · sem chave',
    color: '#10b981',
    icon: '🟢',
    doFetch: asFetchCrossRef,
    buildUrl: (q, y1, y2) =>
      `https://search.crossref.org/?q=${encodeURIComponent(q)}`
  },
  {
    key: 'semantic',
    name: 'Semantic Scholar',
    tier: 1,
    tagline: 'Grafo semântico · API pública · sem chave',
    color: '#8b5cf6',
    icon: '🟣',
    needsKey: true, keyParam: 'semantic', keyUrl: 'https://www.semanticscholar.org/product/api',
    keyHint: 'Opcional. Com chave os limites aumentam consideravelmente.',
    doFetch: asFetchSemantic,
    buildUrl: (q, y1, y2) =>
      `https://www.semanticscholar.org/search?q=${encodeURIComponent(q)}&sort=Relevance`
  },
  {
    key: 'scielo',
    name: 'SciELO',
    tier: 1,
    tagline: 'América Latina e Caribe · API pública · sem chave',
    color: '#059669',
    icon: '🟩',
    doFetch: asFetchScielo,
    buildUrl: (q, y1, y2) => {
      let url = `https://search.scielo.org/?q=${encodeURIComponent(q)}&lang=pt`;
      if (y1) url += `&from=${y1}`;
      if (y2) url += `&to=${y2}`;
      return url;
    }
  },

  // ─── TIER 2: API com chave gratuita ─────────────────────
  {
    key: 'ieee',
    name: 'IEEE Xplore',
    tier: 2,
    tagline: 'Engenharia/TI · Chave gratuita em developer.ieee.org',
    color: '#00629b',
    icon: '🔵',
    needsKey: true, keyParam: 'ieee', keyUrl: 'https://developer.ieee.org/',
    keyHint: 'Registre em developer.ieee.org e gere uma API Key gratuita.',
    doFetch: asFetchIEEE,
    buildUrl: (q, y1, y2) => {
      let url = `https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=${encodeURIComponent(q)}&newsearch=true`;
      if (y1) url += `&dateBegin=${y1}`;
      if (y2) url += `&dateEnd=${y2}`;
      return url;
    },
    exportHint: 'No IEEE Xplore: Results → Export → CSV → carregue aqui via "Importar Resultados".'
  },
  {
    key: 'springer',
    name: 'Springer Link',
    tier: 2,
    tagline: 'Publicações Springer · Chave gratuita em dev.springernature.com',
    color: '#f97316',
    icon: '🟠',
    needsKey: true, keyParam: 'springer', keyUrl: 'https://dev.springernature.com/',
    keyHint: 'Registre em dev.springernature.com e gere uma API Key gratuita.',
    doFetch: asFetchSpringer,
    buildUrl: (q, y1, y2) => {
      let url = `https://link.springer.com/search?query=${encodeURIComponent(q)}`;
      if (y1) url += `&facet-start-year=${y1}`;
      if (y2) url += `&facet-end-year=${y2}`;
      return url;
    },
    exportHint: 'No Springer: resultados → Download → CSV/RIS → importe via "Importar Resultados".'
  },
  {
    key: 'scopus',
    name: 'Scopus',
    tier: 2,
    tagline: 'Multidisciplinar · Chave via dev.elsevier.com (acesso institucional)',
    color: '#f59e0b',
    icon: '🟡',
    needsKey: true, keyParam: 'scopus', keyUrl: 'https://dev.elsevier.com/',
    keyHint: 'Obtenha chave em dev.elsevier.com (requer acesso institucional à Elsevier).',
    doFetch: asFetchScopus,
    buildUrl: (q, y1, y2) => {
      const sq = `TITLE-ABS-KEY(${q})${y1 ? ` AND PUBYEAR > ${y1-1}` : ''}${y2 ? ` AND PUBYEAR < ${y2+1}` : ''}`;
      return `https://www.scopus.com/search/form.uri#advanced?query=${encodeURIComponent(sq)}`;
    },
    exportHint: 'No Scopus: Export → CSV → todas as informações → importe via "Importar Resultados".'
  },

  // ─── TIER 3: Sem API pública — URL + instruções ──────────
  {
    key: 'wos',
    name: 'Web of Science',
    tier: 3,
    tagline: 'API paga (Clarivate). Use exportação manual.',
    color: '#ef4444',
    icon: '🔴',
    buildUrl: (q, y1, y2) =>
      `https://www.webofscience.com/wos/woscc/advanced-search`,
    buildQuery: (q, y1, y2) => {
      let qr = `TS=(${q})`;
      if (y1 && y2) qr += ` AND PY=(${y1}-${y2})`;
      return qr;
    },
    exportHint: 'No WoS: Advanced Search → cole a query gerada → Export → Tab-delimited (UTF-8) → importe via "Importar Resultados".'
  },
  {
    key: 'acm',
    name: 'ACM Digital Library',
    tier: 3,
    tagline: 'Sem API pública. Use exportação manual.',
    color: '#3b82f6',
    icon: '🔵',
    buildUrl: (q, y1, y2) => {
      let url = `https://dl.acm.org/action/doSearch?fillQuickSearch=false&target=advanced&AllField=${encodeURIComponent(q)}`;
      if (y1) url += `&AfterYear=${y1}`;
      if (y2) url += `&BeforeYear=${y2}`;
      return url;
    },
    exportHint: 'No ACM: selecione todos os resultados → Export → CSV → importe via "Importar Resultados".'
  },
  {
    key: 'psycinfo',
    name: 'PsycINFO',
    tier: 3,
    tagline: 'Via APA PsycNET / EBSCOhost. Acesso institucional.',
    color: '#ec4899',
    icon: '🟥',
    buildUrl: (q, y1, y2) => {
      let url = `https://psycnet.apa.org/search/advanced?tab=PA&searchTerm=${encodeURIComponent(q)}`;
      if (y1) url += `&publication_year_from=${y1}`;
      if (y2) url += `&publication_year_to=${y2}`;
      return url;
    },
    exportHint: 'No PsycNET: Export Citations → CSV/RIS → importe via "Importar Resultados".\nOu acesse pelo EBSCOhost da sua instituição e exporte em formato CSV.'
  },
  {
    key: 'philpapers',
    name: 'PhilPapers',
    tier: 3,
    tagline: 'Filosofia. API limitada, sem busca pública por texto.',
    color: '#6366f1',
    icon: '🟦',
    buildUrl: (q, y1, y2) => {
      let url = `https://philpapers.org/search?searchStr=${encodeURIComponent(q)}&searchScope=everything&ftSearch=on`;
      if (y1) url += `&startYear=${y1}`;
      if (y2) url += `&endYear=${y2}`;
      return url;
    },
    exportHint: 'No PhilPapers: selecione resultados → Export → BibTeX ou CSV → converta e importe via "Importar Resultados".'
  },
  {
    key: 'compendex',
    name: 'El Compendex',
    tier: 3,
    tagline: 'Engineering Village (Elsevier). Acesso institucional.',
    color: '#7c3aed',
    icon: '🟪',
    buildUrl: (q, y1, y2) => {
      let url = `https://www.engineeringvillage.com/search/quick.url?query=${encodeURIComponent(q)}`;
      return url;
    },
    buildQuery: (q, y1, y2) => {
      let qr = `(${q})`;
      if (y1 && y2) qr += ` AND {py} WN YR AND (${y1}:${y2}) WN YR`;
      return qr;
    },
    exportHint: 'No Engineering Village: Download → CSV → importe via "Importar Resultados".'
  }
];

// ── ESTADO LOCAL DA AUTO-BUSCA ───────────────────────────────
const AS_STATE = {};
AS_SOURCES.forEach(s => {
  AS_STATE[s.key] = { status: 'idle', count: 0, error: null };
});

// ── UTILITÁRIOS ──────────────────────────────────────────────
function asProxy(url) {
  // usa corsproxy.io apenas se ativado
  if (S.settings?.useProxy) return `https://corsproxy.io/?${encodeURIComponent(url)}`;
  return url;
}

function asGetKey(param) {
  return S.apiKeys?.[param] || '';
}

function asDbId(sourceKey) {
  // encontra ou cria entrada em S.databases para esta fonte
  const src = AS_SOURCES.find(s => s.key === sourceKey);
  let db = S.databases.find(d => d.autoSearchKey === sourceKey);
  if (!db) {
    db = {
      id: uid(), name: src.name, acronym: src.key.toUpperCase(),
      autoSearchKey: sourceKey,
      searchDate: today(), searchString: asGetCurrentQuery(),
      recordsFound: null, notes: 'Importado via auto-busca', createdAt: now()
    };
    S.databases.push(db);
  }
  return db.id;
}

function asGetCurrentQuery() {
  return el('as-query')?.value || S.project.researchQuestion || '';
}
function asGetYear(id) {
  return parseInt(el(id)?.value) || null;
}

function asImportRecords(sourceKey, records) {
  if (!records.length) return 0;
  const dbId = asDbId(sourceKey);
  let added = 0;
  records.forEach(r => {
    if (!r.title?.trim()) return;
    S.records.push({
      id: uid(), sourceDatabase: dbId, importedAt: now(),
      title: (r.title || '').trim(),
      authors: (r.authors || '').trim(),
      year: String(r.year || '').trim(),
      abstract: (r.abstract || '').trim(),
      doi: (r.doi || '').toLowerCase().trim(),
      journal: (r.journal || '').trim(),
      keywords: (r.keywords || '').trim(),
      url: (r.url || '').trim(),
      rawData: r,
      isDuplicate: false, duplicateOf: null, duplicateReason: '',
      screening: { decision: 'pending', criteria: [], note: '', decidedAt: null },
      eligibility: { decision: 'pending', criteria: [], note: '', notRetrieved: false, decidedAt: null },
      extraction: { completed: false, completedAt: null, data: {} }
    });
    added++;
  });
  // update db recordsFound
  const db = S.databases.find(d => d.autoSearchKey === sourceKey);
  if (db) db.recordsFound = (db.recordsFound || 0) + added;
  return added;
}

function asUpdateStatus(key, status, count, error) {
  AS_STATE[key] = { status, count, error };
  asRenderCard(key);
  asUpdateSummary();
}

function asRenderCard(key) {
  const card = el(`as-card-${key}`);
  if (!card) return;
  const src = AS_SOURCES.find(s => s.key === key);
  const state = AS_STATE[key];
  const statusEl = card.querySelector('.as-status');
  const btnEl = card.querySelector('.as-fetch-btn');
  if (statusEl) statusEl.innerHTML = asStatusBadge(state);
  if (btnEl && state.status === 'fetching') {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ Buscando…';
  } else if (btnEl) {
    btnEl.disabled = false;
    btnEl.textContent = state.count > 0 ? `↺ Rebuscar` : (src.tier < 3 ? '🔍 Buscar agora' : '🔗 Abrir base');
  }
}

function asStatusBadge(state) {
  if (state.status === 'idle')     return `<span class="badge badge-slate">Aguardando</span>`;
  if (state.status === 'fetching') return `<span class="badge badge-amber">⏳ Buscando…</span>`;
  if (state.status === 'done')     return `<span class="badge badge-green">✓ ${state.count} registros</span>`;
  if (state.status === 'error')    return `<span class="badge badge-red" title="${esc(state.error)}">✕ Erro</span>`;
  return '';
}

function asUpdateSummary() {
  const total = Object.values(AS_STATE).reduce((acc, s) => acc + (s.count || 0), 0);
  const errors = Object.values(AS_STATE).filter(s => s.status === 'error').length;
  const done = Object.values(AS_STATE).filter(s => s.status === 'done').length;
  const sumEl = el('as-summary');
  if (!sumEl) return;
  sumEl.innerHTML = `
    <strong>${total}</strong> registros importados de <strong>${done}</strong> fontes.
    ${errors ? `<span class="text-danger"> · ${errors} erros.</span>` : ''}
    ${total > 0 ? `<button class="btn btn-sm btn-primary" style="margin-left:12px" onclick="navigate('deduplication')">→ Ir para Deduplicação</button>` : ''}
  `;
}

// ── VIEW ─────────────────────────────────────────────────────
function renderAutoSearch() {
  const q = S.project.researchQuestion || '';
  const keys = S.apiKeys || {};
  const settings = S.settings || {};

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Busca Automática nas Bases</div>
    <div class="section-subtitle">
      Tier 1 = API pública (sem chave) · Tier 2 = API com chave gratuita · Tier 3 = URL gerada + exportação manual
    </div>
  </div>
  <button class="btn btn-success" onclick="asRunAll()">▶ Buscar em Todas (Tiers 1 e 2)</button>
</div>

<div class="card mb-16">
  <div class="card-header"><span class="card-title">🎯 Parâmetros de Busca</span></div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      <div class="form-group" style="grid-column:span 2">
        <label>Query de Busca <span class="req">*</span></label>
        <textarea id="as-query" rows="3" placeholder="Cole aqui a string de busca em linguagem natural ou booleana…">${esc(q)}</textarea>
        <div class="form-hint">Esta query será usada nas bases Tier 1/2. Para Tier 3 você verá a query adaptada ao formato de cada base.</div>
      </div>
      <div class="form-group">
        <label>Ano início</label>
        <input type="number" id="as-year-from" placeholder="Ex: 2018" min="1900" max="2100">
      </div>
      <div class="form-group">
        <label>Ano fim</label>
        <input type="number" id="as-year-to" placeholder="Ex: 2025" min="1900" max="2100" value="${new Date().getFullYear()}">
      </div>
    </div>
    <div class="mt-8" style="display:flex;align-items:center;gap:10px">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="as-use-proxy" ${settings.useProxy?'checked':''} onchange="asToggleProxy(this.checked)">
        Usar proxy CORS (corsproxy.io) para bases com restrição CORS
      </label>
      <span class="badge badge-amber" style="font-size:11px">Recomendado para DBLP, SciELO</span>
    </div>
  </div>
</div>

<div id="as-summary" style="padding:10px 0 16px;font-size:13px;color:var(--slate-500)">
  Nenhuma busca realizada ainda.
</div>

<!-- TIER 1 -->
<div class="mb-8"><span style="font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--green-600)">
  ● Tier 1 — API Pública (sem chave)
</span></div>

${AS_SOURCES.filter(s => s.tier === 1).map(s => asRenderSourceCard(s)).join('')}

<!-- TIER 2 -->
<div class="mb-8 mt-16"><span style="font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--amber-600)">
  ● Tier 2 — API com Chave Gratuita
</span></div>

<div class="card mb-16">
  <div class="card-header"><span class="card-title">🔑 Chaves de API</span></div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      ${AS_SOURCES.filter(s => s.tier === 2 && s.needsKey).map(s => `
      <div class="form-group">
        <label>${s.name} API Key <a href="${s.keyUrl}" target="_blank" style="font-weight:400;font-size:11px;margin-left:4px">→ Obter chave gratuita</a></label>
        <input type="text" id="as-key-${s.keyParam}" value="${esc(asGetKey(s.keyParam))}"
          placeholder="Cole aqui sua API Key…" onchange="asSaveKey('${s.keyParam}', this.value)">
        <div class="form-hint">${s.keyHint||''}</div>
      </div>`).join('')}
      ${AS_SOURCES.filter(s => s.tier === 1 && s.needsKey).map(s => `
      <div class="form-group">
        <label>${s.name} API Key (opcional) <a href="${s.keyUrl}" target="_blank" style="font-weight:400;font-size:11px;margin-left:4px">→ Obter</a></label>
        <input type="text" id="as-key-${s.keyParam}" value="${esc(asGetKey(s.keyParam))}"
          placeholder="Opcional — deixe em branco para usar sem chave…" onchange="asSaveKey('${s.keyParam}', this.value)">
        <div class="form-hint">${s.keyHint||''}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

${AS_SOURCES.filter(s => s.tier === 2).map(s => asRenderSourceCard(s)).join('')}

<!-- TIER 3 -->
<div class="mb-8 mt-16"><span style="font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--red-600)">
  ● Tier 3 — URL Gerada + Exportação Manual
</span></div>
<div class="form-hint mb-12">Estas bases não possuem API pública ou exigem acesso institucional. O sistema gera a URL de busca com os parâmetros preenchidos. Você abre a base, exporta e importa no passo 3.</div>

${AS_SOURCES.filter(s => s.tier === 3).map(s => asRenderSourceCard(s)).join('')}
`;
  asUpdateSummary();
}

function asRenderSourceCard(src) {
  const state = AS_STATE[src.key];
  const currentCount = S.records.filter(r => {
    const db = S.databases.find(d => d.autoSearchKey === src.key);
    return db && r.sourceDatabase === db.id;
  }).length;

  return `
<div class="card mb-12" id="as-card-${src.key}" style="border-left:4px solid ${src.color}">
  <div class="card-body" style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <strong style="font-size:14px">${src.icon} ${src.name}</strong>
          <span class="badge badge-${src.tier===1?'green':src.tier===2?'amber':'red'}" style="font-size:10px">Tier ${src.tier}</span>
        </div>
        <div class="text-sm text-muted">${esc(src.tagline)}</div>
      </div>
      <div class="as-status">${asStatusBadge(state)}</div>
      ${currentCount > 0 ? `<span class="badge badge-blue">${currentCount} no sistema</span>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${src.tier < 3
          ? `<button class="btn btn-sm btn-primary as-fetch-btn" onclick="asFetch('${src.key}')">🔍 Buscar agora</button>`
          : `<button class="btn btn-sm btn-ghost as-fetch-btn" onclick="asOpenUrl('${src.key}')">🔗 Abrir base</button>`
        }
        ${src.tier === 3 && src.buildQuery ? `<button class="btn btn-sm btn-ghost" onclick="asShowQuery('${src.key}')">📋 Ver query</button>` : ''}
        ${src.exportHint ? `<button class="btn btn-sm btn-ghost" onclick="asShowExportHint('${src.key}')">ℹ️ Como exportar</button>` : ''}
      </div>
    </div>
    ${state.status === 'error' ? `<div class="mt-8 text-sm text-danger">Erro: ${esc(state.error)}</div>` : ''}
  </div>
</div>`;
}

// ── AÇÕES ────────────────────────────────────────────────────
function asFetch(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  if (!src?.doFetch) { asOpenUrl(key); return; }
  const q = el('as-query')?.value.trim();
  if (!q) { toast('Preencha a query de busca', 'warning'); return; }
  const y1 = asGetYear('as-year-from');
  const y2 = asGetYear('as-year-to');
  asUpdateStatus(key, 'fetching', 0, null);
  src.doFetch(q, y1, y2)
    .then(records => {
      const added = asImportRecords(key, records);
      audit('import', `Auto-busca ${src.name}: ${added} registros`, { source: src.name, query: q, yearFrom: y1, yearTo: y2, count: added });
      saveState();
      asUpdateStatus(key, 'done', added, null);
      toast(`${src.name}: ${added} registros importados`, 'success');
    })
    .catch(err => {
      const msg = err.message || String(err);
      asUpdateStatus(key, 'error', 0, msg);
      toast(`Erro em ${src.name}: ${msg}`, 'error', 5000);
    });
}

async function asRunAll() {
  const q = el('as-query')?.value.trim();
  if (!q) { toast('Preencha a query de busca primeiro', 'warning'); return; }
  const sources = AS_SOURCES.filter(s => s.tier < 3 && s.doFetch);
  toast(`Iniciando busca em ${sources.length} fontes…`, 'info');
  for (const src of sources) {
    await new Promise(r => setTimeout(r, 300));
    asFetch(src.key);
  }
}

function asOpenUrl(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  const q = el('as-query')?.value.trim() || S.project.researchQuestion || '';
  const y1 = asGetYear('as-year-from');
  const y2 = asGetYear('as-year-to');
  const url = src.buildUrl(q, y1, y2);
  window.open(url, '_blank');
}

function asShowQuery(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  const q = el('as-query')?.value.trim() || '';
  const y1 = asGetYear('as-year-from');
  const y2 = asGetYear('as-year-to');
  const adapted = src.buildQuery ? src.buildQuery(q, y1, y2) : q;
  openModal(
    `Query para ${src.name}`,
    `<div class="form-hint mb-8">Cole esta query no campo de busca avançada da base:</div>
     <pre>${esc(adapted)}</pre>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="navigator.clipboard.writeText(${JSON.stringify(adapted)});toast('Copiado!','success')">📋 Copiar</button>`
  );
}

function asShowExportHint(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  openModal(
    `Como exportar — ${src.name}`,
    `<div style="white-space:pre-wrap;font-size:13px;color:var(--slate-700)">${esc(src.exportHint || '')}</div>
     <div class="mt-12 phase-banner ongoing">
       Após exportar, vá para <strong>3. Importar Resultados</strong> e carregue o arquivo.
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="closeModal();asOpenUrl('${key}')">🔗 Abrir base</button>`
  );
}

function asSaveKey(param, val) {
  if (!S.apiKeys) S.apiKeys = {};
  S.apiKeys[param] = val.trim();
  saveState();
}

function asToggleProxy(val) {
  if (!S.settings) S.settings = {};
  S.settings.useProxy = val;
  saveState();
}

// ── FETCH FUNCTIONS ───────────────────────────────────────────

// DBLP ──────────────────────────────────────────────────────
async function asFetchDblp(query, yearFrom, yearTo) {
  const url = asProxy(`https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&h=1000&format=json`);
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const hits = data.result?.hits?.hit || [];
  return hits
    .filter(h => {
      const yr = parseInt(h.info?.year);
      return (!yearFrom || yr >= yearFrom) && (!yearTo || yr <= yearTo);
    })
    .map(h => {
      const info = h.info || {};
      const authorRaw = info.authors?.author;
      let authors = '';
      if (Array.isArray(authorRaw)) {
        authors = authorRaw.map(a => (typeof a === 'string' ? a : (a?.text || ''))).join(', ');
      } else if (typeof authorRaw === 'string') {
        authors = authorRaw;
      } else if (authorRaw && authorRaw.text) {
        authors = authorRaw.text;
      }
      return {
        title: info.title || '',
        authors,
        year: info.year || '',
        doi: info.doi || '',
        journal: info.venue || info.journal || '',
        url: info.ee || info.url || '',
        keywords: '',
        abstract: ''
      };
    });
}

// OpenAlex ──────────────────────────────────────────────────
async function asFetchOpenAlex(query, yearFrom, yearTo) {
  const key = asGetKey('openalex');
  const allResults = [];
  let cursor = '*';
  const perPage = 200;
  const maxPages = 10; // up to 2000 results

  for (let page = 0; page < maxPages; page++) {
    let url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}`;
    if (yearFrom || yearTo) {
      const from = yearFrom || 1900;
      const to   = yearTo   || new Date().getFullYear();
      url += `&filter=publication_year:${from}-${to}`;
    }
    url += '&select=title,authorships,publication_year,doi,primary_location,abstract_inverted_index,keywords';
    if (key) url += `&api_key=${key}`;

    const headers = { 'Accept': 'application/json', 'User-Agent': 'RSL-PRISMA-ScR mailto:pesquisadora@doutorado.edu.br' };
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
    const data = await res.json();

    const results = data.results || [];
    results.forEach(r => {
      allResults.push({
        title: r.title || '',
        authors: (r.authorships || []).map(a => a.author?.display_name || '').filter(Boolean).join(', '),
        year: String(r.publication_year || ''),
        doi: r.doi ? r.doi.replace('https://doi.org/', '') : '',
        journal: r.primary_location?.source?.display_name || '',
        url: r.doi || '',
        keywords: (r.keywords || []).map(k => k.display_name).join(', '),
        abstract: asReconstructAbstract(r.abstract_inverted_index)
      });
    });

    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor || results.length < perPage) break;
    cursor = nextCursor;
    await new Promise(r => setTimeout(r, 200)); // polite delay
  }
  return allResults;
}

function asReconstructAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const words = [];
  Object.entries(inv).forEach(([word, positions]) => {
    positions.forEach(pos => { words[pos] = word; });
  });
  return words.filter(Boolean).join(' ');
}

// CrossRef ──────────────────────────────────────────────────
async function asFetchCrossRef(query, yearFrom, yearTo) {
  let filter = [];
  if (yearFrom) filter.push(`from-pub-date:${yearFrom}-01-01`);
  if (yearTo)   filter.push(`until-pub-date:${yearTo}-12-31`);
  const filterStr = filter.length ? `&filter=${filter.join(',')}` : '';
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=1000${filterStr}&mailto=rsl@doutorado.edu.br`;

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.message?.items || []).map(item => {
    const titleArr = item.title;
    const title = Array.isArray(titleArr) ? titleArr[0] : (titleArr || '');
    const container = item['container-title'];
    const journal = Array.isArray(container) ? container[0] : (container || '');
    const issued = item.issued?.['date-parts']?.[0]?.[0]
      || item['published-print']?.['date-parts']?.[0]?.[0]
      || item['published-online']?.['date-parts']?.[0]?.[0] || '';
    const authors = (item.author || [])
      .map(a => [a.family, a.given].filter(Boolean).join(', ')).join('; ');
    return {
      title,
      authors,
      year: String(issued),
      doi: item.DOI || '',
      journal,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      keywords: (item.subject || []).join(', '),
      abstract: item.abstract ? item.abstract.replace(/<[^>]+>/g, '') : ''
    };
  });
}

// Semantic Scholar ───────────────────────────────────────────
async function asFetchSemantic(query, yearFrom, yearTo) {
  const key = asGetKey('semantic');
  const allResults = [];
  let offset = 0;
  const limit = 100;
  const maxResults = 500;

  while (offset < maxResults) {
    let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue,publicationTypes&limit=${limit}&offset=${offset}`;
    if (yearFrom && yearTo) url += `&year=${yearFrom}-${yearTo}`;
    else if (yearFrom) url += `&year=${yearFrom}-`;
    else if (yearTo)   url += `&year=-${yearTo}`;

    const headers = { 'Accept': 'application/json' };
    if (key) headers['x-api-key'] = key;

    const res = await fetch(url, { headers });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const papers = data.data || [];
    papers.forEach(p => {
      allResults.push({
        title: p.title || '',
        authors: (p.authors || []).map(a => a.name || '').join(', '),
        year: String(p.year || ''),
        doi: p.externalIds?.DOI || '',
        journal: p.venue || '',
        url: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : '',
        keywords: '',
        abstract: p.abstract || ''
      });
    });

    if (papers.length < limit) break;
    offset += limit;
    await new Promise(r => setTimeout(r, 800)); // Semantic Scholar: 1 req/s sem chave
  }
  return allResults;
}

// SciELO ────────────────────────────────────────────────────
async function asFetchScielo(query, yearFrom, yearTo) {
  let url = asProxy(`https://search.scielo.org/api/v2/search/?q=${encodeURIComponent(query)}&lang=pt-br&output=json&start=0&rows=1000`);
  if (yearFrom) url += `&from=${yearFrom}`;
  if (yearTo)   url += `&to=${yearTo}`;

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const articles = data.response?.docs || data.articles || [];
  return articles.map(a => ({
    title: a.ti?.[0] || a.title_display || a.title || '',
    authors: Array.isArray(a.au) ? a.au.join(', ') : (a.au || ''),
    year: String(a.dp || a.publication_year || a.year || ''),
    doi: a.doi || '',
    journal: a.ta || a.journal_title || '',
    url: a.ur?.[0] || (a.doi ? `https://doi.org/${a.doi}` : ''),
    keywords: Array.isArray(a.wok_subject_categories) ? a.wok_subject_categories.join(', ') : '',
    abstract: a.ab?.[0] || ''
  }));
}

// IEEE Xplore ───────────────────────────────────────────────
async function asFetchIEEE(query, yearFrom, yearTo) {
  const key = asGetKey('ieee');
  if (!key) throw new Error('API key do IEEE não configurada. Registre em developer.ieee.org');

  const params = new URLSearchParams({
    querytext: query, apikey: key, max_records: '200', start_record: '1'
  });
  if (yearFrom) params.append('start_year', yearFrom);
  if (yearTo)   params.append('end_year', yearTo);

  const url = `https://ieeexploreapi.ieee.org/api/v1/search/articles?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${errBody.slice(0, 120)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return (data.articles || []).map(a => ({
    title: a.title || '',
    authors: (a.authors?.authors || []).map(au => au.full_name || '').join(', '),
    year: String(a.publication_year || ''),
    doi: a.doi || '',
    journal: a.publication_title || '',
    url: a.html_url || a.pdf_url || '',
    keywords: [
      ...(a.index_terms?.ieee_terms?.terms || []),
      ...(a.index_terms?.author_terms?.terms || [])
    ].join(', '),
    abstract: a.abstract || ''
  }));
}

// Springer Link ──────────────────────────────────────────────
async function asFetchSpringer(query, yearFrom, yearTo) {
  const key = asGetKey('springer');
  if (!key) throw new Error('API key do Springer não configurada. Registre em dev.springernature.com');

  const allResults = [];
  let start = 1;
  const pageSize = 100;
  const maxResults = 500;

  while (start <= maxResults) {
    let q = query;
    if (yearFrom && yearTo) q += ` date:${yearFrom}-${yearTo}`;
    const url = `https://api.springernature.com/meta/v2/json?q=${encodeURIComponent(q)}&p=${pageSize}&s=${start}&api_key=${key}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const records = data.records || [];
    records.forEach(r => {
      allResults.push({
        title: r.title || '',
        authors: (r.creators || []).map(c => c.creator || '').join(', '),
        year: r.publicationDate?.split('-')[0] || '',
        doi: r.doi || '',
        journal: r.publicationName || r.isbn || '',
        url: r.url?.[0]?.value || (r.doi ? `https://doi.org/${r.doi}` : ''),
        keywords: (r.keyword || []).join(', '),
        abstract: r.abstract || ''
      });
    });

    const total = parseInt(data.result?.[0]?.total || '0');
    if (records.length < pageSize || start + pageSize > total) break;
    start += pageSize;
    await new Promise(r => setTimeout(r, 300));
  }
  return allResults;
}

// Scopus (Elsevier) ──────────────────────────────────────────
async function asFetchScopus(query, yearFrom, yearTo) {
  const key = asGetKey('scopus');
  if (!key) throw new Error('API key do Scopus não configurada. Acesse dev.elsevier.com');

  const allResults = [];
  let start = 0;
  const count = 200;
  const maxResults = 2000;

  let scopusQ = `TITLE-ABS-KEY(${query})`;
  if (yearFrom) scopusQ += ` AND PUBYEAR > ${yearFrom - 1}`;
  if (yearTo)   scopusQ += ` AND PUBYEAR < ${yearTo + 1}`;

  while (start < maxResults) {
    const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(scopusQ)}&apiKey=${key}&count=${count}&start=${start}&httpAccept=application%2Fjson&field=dc:title,dc:creator,prism:publicationName,prism:coverDate,prism:doi,dc:description,authkeywords,prism:url`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-ELS-APIKey': key } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
    }
    const data = await res.json();
    const entries = data['search-results']?.entry || [];

    entries.forEach(e => {
      allResults.push({
        title: e['dc:title'] || '',
        authors: e['dc:creator'] || '',
        year: (e['prism:coverDate'] || '').slice(0, 4),
        doi: e['prism:doi'] || '',
        journal: e['prism:publicationName'] || '',
        url: e['prism:url'] || (e['prism:doi'] ? `https://doi.org/${e['prism:doi']}` : ''),
        keywords: e['authkeywords'] || '',
        abstract: e['dc:description'] || ''
      });
    });

    const totalResults = parseInt(data['search-results']?.['opensearch:totalResults'] || '0');
    if (entries.length < count || start + count >= totalResults) break;
    start += count;
    await new Promise(r => setTimeout(r, 300));
  }
  return allResults;
}

// ── INTEGRAÇÃO COM O APP ─────────────────────────────────────
// registra a view e o item de navegação após o DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
  // garante que apiKeys e settings existem no estado
  if (!S.apiKeys)  S.apiKeys  = {};
  if (!S.settings) S.settings = {};

  // injeta item de nav após "Bases de Dados"
  const navList = el('nav-list');
  if (navList) {
    const dbItem = navList.querySelector('[data-view="databases"]');
    if (dbItem && !navList.querySelector('[data-view="autosearch"]')) {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.dataset.view = 'autosearch';
      li.innerHTML = `
        <span class="nav-num">2b</span>
        <span class="nav-label">Auto-Busca</span>
        <span class="nav-status" id="ns-autosearch"></span>`;
      li.addEventListener('click', () => navigate('autosearch'));
      dbItem.insertAdjacentElement('afterend', li);
    }
  }
}, { once: true });

// expõe renderAutoSearch ao router do app.js
window._autoSearchView = renderAutoSearch;

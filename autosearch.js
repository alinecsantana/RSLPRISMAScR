'use strict';
// ============================================================
// RSL SYSTEM — Auto-Busca (PRISMA-ScR)  v1.1
// Busca automática nas bases de dados científicas
// ============================================================

// ── CONFIGURAÇÃO DAS BASES ───────────────────────────────────
const AS_SOURCES = [

  // ─── TIER 1: API pública, CORS liberado ──────────────────
  {
    key: 'dblp',
    name: 'DBLP',
    tier: 1,
    icon: '💻',
    tagline: 'Ciência da Computação · API pública · sem chave · CORS ✓',
    color: '#4285f4',
    doFetch: asFetchDblp,
    buildUrl: (q) => `https://dblp.org/search?q=${encodeURIComponent(q)}`
  },
  {
    key: 'openalex',
    name: 'OpenAlex',
    tier: 1,
    icon: '🌐',
    tagline: 'Catálogo global (200M+ artigos) · CORS ✓ · chave gratuita amplia limite',
    color: '#0ea5e9',
    needsKey: true, keyParam: 'openalex', keyUrl: 'https://openalex.org/developers',
    keyHint: 'Opcional — registre em openalex.org para obter maior limite de requisições.',
    doFetch: asFetchOpenAlex,
    buildUrl: (q, y1, y2) => `https://openalex.org/works?search=${encodeURIComponent(q)}` + (y1 ? `&filter=publication_year:${y1}-${y2||new Date().getFullYear()}` : '')
  },
  {
    key: 'crossref',
    name: 'CrossRef',
    tier: 1,
    icon: '🔗',
    tagline: 'Metadados de DOIs · API pública · sem chave · CORS ✓',
    color: '#10b981',
    doFetch: asFetchCrossRef,
    buildUrl: (q) => `https://search.crossref.org/?q=${encodeURIComponent(q)}`
  },

  // ─── TIER 2: API com chave gratuita ──────────────────────
  {
    key: 'ieee',
    name: 'IEEE Xplore',
    tier: 2,
    icon: '⚡',
    tagline: 'Engenharia & TI · Chave gratuita em developer.ieee.org',
    color: '#00629b',
    needsKey: true, keyParam: 'ieee', keyUrl: 'https://developer.ieee.org/',
    keyHint: 'Crie conta em developer.ieee.org → My Applications → + New Application → copie a API Key.',
    doFetch: asFetchIEEE,
    buildUrl: (q, y1, y2) => `https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=${encodeURIComponent(q)}&newsearch=true` + (y1 ? `&dateBegin=${y1}&dateEnd=${y2||''}` : ''),
    exportHint: 'IEEE Xplore → Results → Export → CSV → carregue no passo "Importar Resultados".'
  },
  {
    key: 'springer',
    name: 'Springer Link',
    tier: 2,
    icon: '📗',
    tagline: 'Publicações Springer/Nature · Chave gratuita em dev.springernature.com',
    color: '#f97316',
    needsKey: true, keyParam: 'springer', keyUrl: 'https://dev.springernature.com/',
    keyHint: 'Registre em dev.springernature.com → Applications → New Application → copie a API Key.',
    doFetch: asFetchSpringer,
    buildUrl: (q, y1, y2) => `https://link.springer.com/search?query=${encodeURIComponent(q)}` + (y1 ? `&facet-start-year=${y1}&facet-end-year=${y2||''}` : ''),
    exportHint: 'Springer → resultados → Download → CSV/RIS → importe via "Importar Resultados".'
  },
  {
    key: 'scopus',
    name: 'Scopus',
    tier: 2,
    icon: '📊',
    tagline: 'Multidisciplinar (90M+ artigos) · Chave via dev.elsevier.com (institucional)',
    color: '#f59e0b',
    needsKey: true, keyParam: 'scopus', keyUrl: 'https://dev.elsevier.com/',
    keyHint: 'Acesse dev.elsevier.com → My API Key → Create API Key. Requer acesso institucional à Elsevier.',
    doFetch: asFetchScopus,
    buildUrl: (q, y1, y2) => {
      const sq = `TITLE-ABS-KEY(${q})` + (y1 ? ` AND PUBYEAR > ${y1-1} AND PUBYEAR < ${(y2||new Date().getFullYear())+1}` : '');
      return `https://www.scopus.com/search/form.uri#advanced?query=${encodeURIComponent(sq)}`;
    },
    exportHint: 'Scopus → Export → CSV → todas as informações → importe via "Importar Resultados".'
  },

  // ─── TIER 3: Sem API pública — URL gerada + exportação manual
  {
    key: 'semantic',
    name: 'Semantic Scholar',
    tier: 3,
    icon: '🧠',
    tagline: 'Sem CORS (bloqueado em browser) · Use exportação manual ou instale proxy local',
    color: '#8b5cf6',
    buildUrl: (q, y1, y2) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(q)}&sort=Relevance`,
    buildQuery: (q, y1, y2) => q,
    exportHint: 'Semantic Scholar não permite busca automática de browser por bloqueio CORS.\n\nAlternativa: acesse o site, filtre por ano, e use a extensão "Zotero" ou "Rayyan" para exportar, depois importe via "Importar Resultados".'
  },
  {
    key: 'wos',
    name: 'Web of Science',
    tier: 3,
    icon: '🔬',
    tagline: 'API paga (Clarivate) · Acesso institucional · exportação manual',
    color: '#ef4444',
    buildUrl: () => `https://www.webofscience.com/wos/woscc/advanced-search`,
    buildQuery: (q, y1, y2) => `TS=(${q})` + (y1 && y2 ? ` AND PY=(${y1}-${y2})` : ''),
    exportHint: 'Web of Science → Advanced Search → cole a query gerada → Export → Tab-delimited (UTF-8) → importe via "Importar Resultados".'
  },
  {
    key: 'acm',
    name: 'ACM Digital Library',
    tier: 3,
    icon: '📚',
    tagline: 'Sem API pública · exportação manual',
    color: '#3b82f6',
    buildUrl: (q, y1, y2) => `https://dl.acm.org/action/doSearch?fillQuickSearch=false&target=advanced&AllField=${encodeURIComponent(q)}` + (y1 ? `&AfterYear=${y1}&BeforeYear=${y2||''}` : ''),
    exportHint: 'ACM DL → selecione todos os resultados → Export Citations → CSV → importe via "Importar Resultados".'
  },
  {
    key: 'psycinfo',
    name: 'PsycINFO',
    tier: 3,
    icon: '🧬',
    tagline: 'Via APA PsycNET / EBSCOhost · acesso institucional',
    color: '#ec4899',
    buildUrl: (q, y1, y2) => `https://psycnet.apa.org/search/advanced?tab=PA&searchTerm=${encodeURIComponent(q)}` + (y1 ? `&publication_year_from=${y1}&publication_year_to=${y2||''}` : ''),
    exportHint: 'PsycNET → Export Citations → CSV/RIS → importe via "Importar Resultados".\nAlternativa: acesse via EBSCOhost da sua instituição e exporte em CSV.'
  },
  {
    key: 'philpapers',
    name: 'PhilPapers',
    tier: 3,
    icon: '📖',
    tagline: 'Filosofia · sem API de busca pública',
    color: '#6366f1',
    buildUrl: (q, y1, y2) => `https://philpapers.org/search?searchStr=${encodeURIComponent(q)}&searchScope=everything&ftSearch=on` + (y1 ? `&startYear=${y1}&endYear=${y2||''}` : ''),
    exportHint: 'PhilPapers → selecione resultados → Export → BibTeX/CSV → importe via "Importar Resultados".'
  },
  {
    key: 'scielo',
    name: 'SciELO',
    tier: 3,
    icon: '🌿',
    tagline: 'América Latina · API bloqueia browser (403) · URL gerada disponível',
    color: '#059669',
    buildUrl: (q, y1, y2) => `https://search.scielo.org/?q=${encodeURIComponent(q)}&lang=pt` + (y1 ? `&from=${y1}&to=${y2||''}` : ''),
    exportHint: 'SciELO → resultados → Exportar → CSV → importe via "Importar Resultados".\nOu acesse scielo.br e filtre por ano.'
  },
  {
    key: 'compendex',
    name: 'El Compendex',
    tier: 3,
    icon: '⚙️',
    tagline: 'Engineering Village (Elsevier) · acesso institucional',
    color: '#7c3aed',
    buildUrl: (q) => `https://www.engineeringvillage.com/search/quick.url?query=${encodeURIComponent(q)}`,
    buildQuery: (q, y1, y2) => `(${q})` + (y1 && y2 ? ` {py} WN YR AND (${y1}:${y2}) WN YR` : ''),
    exportHint: 'Engineering Village → Download → CSV → importe via "Importar Resultados".'
  }
];

// ── ESTADO LOCAL ──────────────────────────────────────────────
const AS_STATE = {};
AS_SOURCES.forEach(s => { AS_STATE[s.key] = { status: 'idle', count: 0, error: null }; });

// ── UTILITÁRIOS ──────────────────────────────────────────────
function asProxy(url) {
  if (S.settings?.useProxy) return `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  return url;
}
function asGetKey(param) { return (S.apiKeys || {})[param] || ''; }
function asGetCurrentQuery() { return el('as-query')?.value?.trim() || S.project?.researchQuestion || ''; }
function asGetYear(id) { return parseInt(el(id)?.value) || null; }

function asDbId(sourceKey) {
  const src = AS_SOURCES.find(s => s.key === sourceKey);
  let db = S.databases.find(d => d.autoSearchKey === sourceKey);
  if (!db) {
    db = {
      id: uid(), name: src.name, acronym: src.key.toUpperCase(),
      autoSearchKey: sourceKey, searchDate: today(),
      searchString: asGetCurrentQuery(),
      recordsFound: null, notes: 'Importado via auto-busca', createdAt: now()
    };
    S.databases.push(db);
  }
  return db.id;
}

function asImportRecords(sourceKey, records) {
  if (!records || !records.length) return 0;
  const dbId = asDbId(sourceKey);
  let added = 0;
  records.forEach(r => {
    const title = (r.title || '').trim();
    if (!title) return;
    S.records.push({
      id: uid(), sourceDatabase: dbId, importedAt: now(),
      title,
      authors: (r.authors || '').slice(0, 400),
      year: String(r.year || '').slice(0, 4),
      abstract: (r.abstract || '').slice(0, 500),   // limite de espaço
      doi: (r.doi || '').toLowerCase().trim().slice(0, 200),
      journal: (r.journal || '').slice(0, 200),
      keywords: (r.keywords || '').slice(0, 300),
      url: (r.url || '').slice(0, 300),
      // sem rawData — evita estourar localStorage
      isDuplicate: false, duplicateOf: null, duplicateReason: '',
      screening:   { decision: 'pending', criteria: [], note: '', decidedAt: null },
      eligibility: { decision: 'pending', criteria: [], note: '', notRetrieved: false, decidedAt: null },
      extraction:  { completed: false, completedAt: null, data: {} }
    });
    added++;
  });
  const db = S.databases.find(d => d.autoSearchKey === sourceKey);
  if (db) db.recordsFound = S.records.filter(r => r.sourceDatabase === db.id).length;
  return added;
}

// ── STATUS UI ────────────────────────────────────────────────
function asUpdateStatus(key, status, count, error) {
  AS_STATE[key] = { status, count, error };
  asRenderCard(key);
  asUpdateSummary();
}

function asRenderCard(key) {
  const card = el(`as-card-${key}`);
  if (!card) return;
  const src = AS_SOURCES.find(s => s.key === key);
  const st  = AS_STATE[key];
  const statusEl = card.querySelector('.as-status');
  const btnEl    = card.querySelector('.as-fetch-btn');
  if (statusEl) statusEl.innerHTML = asStatusBadge(st);
  if (btnEl) {
    if (st.status === 'fetching') {
      btnEl.disabled = true; btnEl.textContent = '⏳ Buscando…';
    } else {
      btnEl.disabled = false;
      btnEl.textContent = st.count > 0
        ? `↺ Rebuscar`
        : (src.tier < 3 ? '🔍 Buscar agora' : '🔗 Abrir base');
    }
  }
}

function asStatusBadge(st) {
  const m = { idle: 'badge-slate', fetching: 'badge-amber', done: 'badge-green', error: 'badge-red' };
  const t = { idle: 'Aguardando', fetching: '⏳ Buscando…', done: `✓ ${st.count} registros`, error: `✕ Erro` };
  const extra = st.status === 'error' ? ` title="${esc(st.error)}"` : '';
  return `<span class="badge ${m[st.status]||'badge-slate'}"${extra}>${t[st.status]||''}</span>`;
}

function asUpdateSummary() {
  const total  = Object.values(AS_STATE).reduce((a, s) => a + (s.count || 0), 0);
  const done   = Object.values(AS_STATE).filter(s => s.status === 'done').length;
  const errors = Object.values(AS_STATE).filter(s => s.status === 'error').length;
  const sumEl  = el('as-summary');
  if (!sumEl) return;
  const totalInSystem = S.records.length;
  sumEl.innerHTML = `
    <div class="phase-banner ${total > 0 ? 'complete' : 'locked'}" style="margin-bottom:0">
      ${total > 0
        ? `✅ <strong>${total}</strong> registros importados de <strong>${done}</strong> fonte(s). Total no sistema: <strong>${totalInSystem}</strong>.`
        : 'Nenhuma busca automática realizada ainda.'}
      ${errors ? ` <span class="text-danger">· ${errors} erro(s) — veja os cards abaixo.</span>` : ''}
      ${total > 0 ? `
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="navigate('deduplication')">→ Ir para Deduplicação</button>
          <button class="btn btn-ghost" onclick="navigate('screening')">→ Ir para Triagem</button>
        </div>` : ''}
    </div>`;
}

// ── VIEW PRINCIPAL ────────────────────────────────────────────
function renderAutoSearch() {
  const q = S.project?.researchQuestion || '';

  el('content-area').innerHTML = `
<div class="section-header">
  <div>
    <div class="section-title">Busca Automática nas Bases</div>
    <div class="section-subtitle">
      <span class="badge badge-green">Tier 1</span> API pública sem chave &nbsp;
      <span class="badge badge-amber">Tier 2</span> API com chave gratuita &nbsp;
      <span class="badge badge-red">Tier 3</span> URL gerada + exportação manual
    </div>
  </div>
  <button class="btn btn-success" onclick="asRunAll()">▶ Buscar Tier 1 + Tier 2</button>
</div>

<!-- PARÂMETROS -->
<div class="card mb-16">
  <div class="card-header"><span class="card-title">🎯 Parâmetros de Busca</span></div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      <div class="form-group" style="grid-column:span 2">
        <label>Query de busca <span class="req">*</span></label>
        <textarea id="as-query" rows="3" placeholder="Ex: (machine learning OR deep learning) AND education">${esc(q)}</textarea>
        <div class="form-hint">Usada diretamente nas APIs. Para Tier 3, o sistema adapta ao syntax de cada base.</div>
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
    <div class="mt-8" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="as-use-proxy" ${S.settings?.useProxy?'checked':''}
          onchange="asToggleProxy(this.checked)">
        Usar proxy CORS (corsproxy.io) — necessário para algumas bases
      </label>
      <span class="badge badge-amber" style="font-size:10px">Requer internet</span>
      <div class="form-hint" style="margin:0">O proxy evita bloqueios de CORS mas adiciona uma requisição extra. Recomendado ligado.</div>
    </div>
  </div>
</div>

<!-- RESUMO -->
<div id="as-summary" style="margin-bottom:16px">
  <div class="phase-banner locked">Nenhuma busca realizada ainda. Configure a query acima e clique "Buscar".</div>
</div>

<!-- TIER 1 -->
<div class="mb-8">
  <span style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--green-600)">
    ● Tier 1 — API Pública (sem chave necessária)
  </span>
</div>
${AS_SOURCES.filter(s => s.tier === 1).map(s => asRenderSourceCard(s)).join('')}

<!-- TIER 2 CHAVES -->
<div class="mb-8 mt-20">
  <span style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--amber-600)">
    ● Tier 2 — API com Chave Gratuita
  </span>
</div>
<div class="card mb-12">
  <div class="card-header">
    <span class="card-title">🔑 Chaves de API — Tier 2</span>
    <button class="btn btn-sm btn-ghost" onclick="asShowApiGuide()">📖 Como obter cada chave</button>
  </div>
  <div class="card-body">
    <div class="form-grid form-grid-2">
      ${[...AS_SOURCES.filter(s => s.tier === 2), ...AS_SOURCES.filter(s => s.tier === 1 && s.needsKey)].map(s => `
      <div class="form-group">
        <label>
          ${s.name}
          <a href="${s.keyUrl}" target="_blank" style="font-weight:400;font-size:11px;margin-left:6px;color:var(--blue-600)">
            → Obter chave gratuita ↗
          </a>
        </label>
        <input type="text" id="as-key-${s.keyParam}"
          value="${esc(asGetKey(s.keyParam))}"
          placeholder="${s.tier===1?'Opcional — deixe vazio para usar sem chave':'Obrigatório para busca automática'}…"
          onchange="asSaveKey('${s.keyParam}', this.value)">
        <div class="form-hint">${esc(s.keyHint||'')}</div>
      </div>`).join('')}
    </div>
  </div>
</div>
${AS_SOURCES.filter(s => s.tier === 2).map(s => asRenderSourceCard(s)).join('')}

<!-- TIER 3 -->
<div class="mb-8 mt-20">
  <span style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--red-600)">
    ● Tier 3 — Sem API Pública (URL gerada + exportação manual)
  </span>
</div>
<div class="phase-banner ongoing mb-12" style="font-size:12px">
  ℹ️ O sistema gera a URL de busca preenchida com sua query. Você abre a base, exporta o CSV/RIS, e importa no passo 3.
  <strong>Clique em "Como exportar"</strong> para instruções específicas de cada base.
</div>
${AS_SOURCES.filter(s => s.tier === 3).map(s => asRenderSourceCard(s)).join('')}
`;
  asUpdateSummary();
}

function asRenderSourceCard(src) {
  const st = AS_STATE[src.key];
  const inSystem = (() => {
    const db = S.databases.find(d => d.autoSearchKey === src.key);
    return db ? S.records.filter(r => r.sourceDatabase === db.id).length : 0;
  })();

  return `
<div class="card mb-10" id="as-card-${src.key}" style="border-left:4px solid ${src.color}">
  <div class="card-body" style="padding:12px 16px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <strong>${src.icon} ${src.name}</strong>
          <span class="badge badge-${src.tier===1?'green':src.tier===2?'amber':'red'}" style="font-size:10px">Tier ${src.tier}</span>
          ${inSystem > 0 ? `<span class="badge badge-blue">${inSystem} no sistema</span>` : ''}
        </div>
        <div class="text-sm text-muted">${esc(src.tagline)}</div>
      </div>
      <div class="as-status">${asStatusBadge(st)}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${src.tier < 3
          ? `<button class="btn btn-sm btn-primary as-fetch-btn" onclick="asFetch('${src.key}')">🔍 Buscar agora</button>`
          : `<button class="btn btn-sm btn-ghost as-fetch-btn" onclick="asOpenUrl('${src.key}')">🔗 Abrir base</button>`}
        ${src.buildQuery ? `<button class="btn btn-sm btn-ghost" onclick="asShowQuery('${src.key}')">📋 Ver query</button>` : ''}
        ${src.exportHint ? `<button class="btn btn-sm btn-ghost" onclick="asShowExportHint('${src.key}')">ℹ️ Como exportar</button>` : ''}
      </div>
    </div>
    ${st.status === 'error' ? `
    <div class="mt-8" style="background:var(--red-50);border:1px solid var(--red-200);border-radius:5px;padding:8px 12px;font-size:12px">
      <strong class="text-danger">Erro:</strong> ${esc(st.error)}
      ${src.tier < 3 ? `<br><span class="text-muted">Tente: ① ativar o proxy CORS ② verificar a API key ③ usar exportação manual (<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:2px 6px" onclick="asOpenUrl('${src.key}')">abrir base →</button>)</span>` : ''}
    </div>` : ''}
  </div>
</div>`;
}

// ── AÇÕES ────────────────────────────────────────────────────
function asFetch(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  if (!src?.doFetch) { asOpenUrl(key); return; }
  const q = asGetCurrentQuery();
  if (!q) { toast('Preencha a query de busca acima', 'warning'); return; }
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
      const msg = err?.message || String(err);
      asUpdateStatus(key, 'error', 0, msg);
      toast(`${src.name}: ${msg.slice(0, 100)}`, 'error', 6000);
    });
}

async function asRunAll() {
  const q = asGetCurrentQuery();
  if (!q) { toast('Preencha a query de busca primeiro', 'warning'); return; }
  const sources = AS_SOURCES.filter(s => s.tier < 3 && s.doFetch);
  toast(`Iniciando busca em ${sources.length} fontes…`, 'info', 4000);
  for (const src of sources) {
    await new Promise(r => setTimeout(r, 400));
    asFetch(src.key);
  }
}

function asOpenUrl(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  const q  = asGetCurrentQuery();
  const y1 = asGetYear('as-year-from');
  const y2 = asGetYear('as-year-to');
  window.open(src.buildUrl(q, y1, y2), '_blank');
}

function asShowQuery(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  const q  = asGetCurrentQuery();
  const y1 = asGetYear('as-year-from');
  const y2 = asGetYear('as-year-to');
  const adapted = src.buildQuery ? src.buildQuery(q, y1, y2) : q;
  openModal(
    `Query para ${src.name}`,
    `<div class="form-hint mb-8">Cole esta query no campo de busca avançada da base:</div>
     <pre>${esc(adapted)}</pre>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="navigator.clipboard.writeText(${JSON.stringify(adapted)}).then(()=>toast('Copiado!','success'))">📋 Copiar</button>`
  );
}

function asShowExportHint(key) {
  const src = AS_SOURCES.find(s => s.key === key);
  openModal(
    `Como exportar — ${src.name}`,
    `<div style="white-space:pre-wrap;font-size:13px;color:var(--slate-700);line-height:1.6">${esc(src.exportHint || '')}</div>
     <div class="mt-12 phase-banner ongoing">
       Após exportar, vá para <strong>3. Importar Resultados</strong> e carregue o arquivo.
     </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="closeModal();asOpenUrl('${key}')">🔗 Abrir base</button>`
  );
}

function asShowApiGuide() {
  openModal(
    '📖 Como obter as chaves de API — Guia passo a passo',
    `
<div style="font-size:13px;line-height:1.7">

<div class="report-section">
  <h3>⚡ IEEE Xplore</h3>
  <ol style="padding-left:18px">
    <li>Acesse <a href="https://developer.ieee.org/" target="_blank">developer.ieee.org</a></li>
    <li>Clique em <strong>Register</strong> e crie uma conta gratuita</li>
    <li>Após login, vá em <strong>My Applications → + New Application</strong></li>
    <li>Preencha nome e aceite os termos → clique em <strong>Create</strong></li>
    <li>Copie a <strong>API Key</strong> gerada e cole no campo IEEE acima</li>
  </ol>
  <div class="form-hint mt-4">Limite: 200 resultados/request, 10 requests/segundo, 200/dia (gratuito)</div>
</div>

<div class="report-section">
  <h3>📗 Springer Link</h3>
  <ol style="padding-left:18px">
    <li>Acesse <a href="https://dev.springernature.com/" target="_blank">dev.springernature.com</a></li>
    <li>Clique em <strong>Sign up</strong> (conta gratuita)</li>
    <li>Após confirmar o e-mail, faça login</li>
    <li>Vá em <strong>Applications → + New Application</strong></li>
    <li>Selecione <strong>Springer Nature Meta API (Open Access)</strong></li>
    <li>Copie a <strong>API Key</strong> e cole no campo Springer acima</li>
  </ol>
  <div class="form-hint mt-4">Limite: 10 requests/segundo, plano gratuito cobre metadata</div>
</div>

<div class="report-section">
  <h3>📊 Scopus / El Compendex (Elsevier)</h3>
  <ol style="padding-left:18px">
    <li>Acesse <a href="https://dev.elsevier.com/" target="_blank">dev.elsevier.com</a></li>
    <li>Clique em <strong>I want an API key</strong></li>
    <li>Faça login com conta institucional (requer acesso ativo ao Scopus)</li>
    <li>Crie uma aplicação e copie a <strong>API Key</strong></li>
    <li>Cole no campo Scopus acima</li>
  </ol>
  <div class="form-hint mt-4">⚠️ Requer assinatura institucional à Elsevier (via sua universidade)</div>
</div>

<div class="report-section">
  <h3>🌐 OpenAlex (opcional)</h3>
  <ol style="padding-left:18px">
    <li>Acesse <a href="https://openalex.org/developers" target="_blank">openalex.org/developers</a></li>
    <li>Clique em <strong>Get API Key</strong> (gratuito)</li>
    <li>Registre seu e-mail institucional</li>
    <li>Cole a chave no campo OpenAlex acima</li>
  </ol>
  <div class="form-hint mt-4">Sem chave funciona via "polite pool" (limite menor). Com chave: 100k requests/dia</div>
</div>

</div>`,
    `<button class="btn btn-primary" onclick="closeModal()">Entendido</button>`
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
  toast(val ? 'Proxy CORS ativado' : 'Proxy CORS desativado', 'info');
}

// ── FETCH FUNCTIONS ───────────────────────────────────────────

// ── DBLP ────────────────────────────────────────────────────
async function asFetchDblp(query, yearFrom, yearTo) {
  const baseUrl = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&h=1000&format=json`;
  const url = asProxy(baseUrl);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  const data = await res.json();
  const hits = data.result?.hits?.hit || [];
  return hits
    .filter(h => {
      const yr = parseInt(h.info?.year);
      return (!yearFrom || yr >= yearFrom) && (!yearTo || yr <= yearTo);
    })
    .map(h => {
      const info = h.info || {};
      const raw  = info.authors?.author;
      const authors = Array.isArray(raw)
        ? raw.map(a => (typeof a === 'string' ? a : a?.text || '')).filter(Boolean).join(', ')
        : (typeof raw === 'string' ? raw : raw?.text || '');
      return {
        title:   info.title   || '',
        authors,
        year:    info.year    || '',
        doi:     info.doi     || '',
        journal: info.venue   || info.journal || '',
        url:     info.ee      || info.url     || '',
        keywords: '', abstract: ''
      };
    });
}

// ── OPENALEX ────────────────────────────────────────────────
async function asFetchOpenAlex(query, yearFrom, yearTo) {
  const key     = asGetKey('openalex');
  const results = [];
  let cursor    = '*';
  const perPage = 100;
  const maxPages = 6; // 600 registros máx. — evita quota do localStorage

  for (let page = 0; page < maxPages; page++) {
    let url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}&mailto=rsl@doutorado.edu.br`;
    if (yearFrom || yearTo)
      url += `&filter=publication_year:${yearFrom||1900}-${yearTo||new Date().getFullYear()}`;
    url += '&select=title,authorships,publication_year,doi,primary_location,keywords';
    if (key) url += `&api_key=${key}`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 150)}`);
    }
    const data = await res.json();
    const batch = data.results || [];
    batch.forEach(r => {
      results.push({
        title:   r.title || '',
        authors: (r.authorships || []).map(a => a.author?.display_name || '').filter(Boolean).join(', '),
        year:    String(r.publication_year || ''),
        doi:     r.doi ? r.doi.replace('https://doi.org/', '') : '',
        journal: r.primary_location?.source?.display_name || '',
        url:     r.doi || '',
        keywords: (r.keywords || []).map(k => k.display_name).join(', ').slice(0, 300),
        abstract: '' // abstract omitido intencionalmente para economizar espaço
      });
    });

    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor || batch.length < perPage) break;
    cursor = nextCursor;
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// ── CROSSREF ────────────────────────────────────────────────
async function asFetchCrossRef(query, yearFrom, yearTo) {
  const filters = [];
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}-01-01`);
  if (yearTo)   filters.push(`until-pub-date:${yearTo}-12-31`);
  const filterStr = filters.length ? `&filter=${filters.join(',')}` : '';
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=1000${filterStr}&mailto=rsl@doutorado.edu.br`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.message?.items || []).map(item => {
    const title   = Array.isArray(item.title) ? item.title[0] : (item.title || '');
    const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : (item['container-title'] || '');
    const year    = item.issued?.['date-parts']?.[0]?.[0]
      || item['published-print']?.['date-parts']?.[0]?.[0]
      || item['published-online']?.['date-parts']?.[0]?.[0] || '';
    const authors = (item.author || [])
      .map(a => [a.family, a.given].filter(Boolean).join(' ')).join(', ');
    return {
      title, authors, year: String(year),
      doi:     item.DOI   || '',
      journal,
      url:     item.URL   || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      keywords: (item.subject || []).join(', '),
      abstract: (item.abstract || '').replace(/<[^>]+>/g, '').slice(0, 500)
    };
  });
}

// ── IEEE XPLORE ──────────────────────────────────────────────
async function asFetchIEEE(query, yearFrom, yearTo) {
  const key = asGetKey('ieee');
  if (!key) throw new Error('API key não configurada. Clique em "Como obter cada chave" acima.');
  const params = new URLSearchParams({ querytext: query, apikey: key, max_records: '200', start_record: '1' });
  if (yearFrom) params.append('start_year', String(yearFrom));
  if (yearTo)   params.append('end_year',   String(yearTo));
  const url = `https://ieeexploreapi.ieee.org/api/v1/search/articles?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));
  return (data.articles || []).map(a => ({
    title:   a.title || '',
    authors: (a.authors?.authors || []).map(au => au.full_name || '').join(', '),
    year:    String(a.publication_year || ''),
    doi:     a.doi  || '',
    journal: a.publication_title || '',
    url:     a.html_url || a.pdf_url || '',
    keywords: [...(a.index_terms?.ieee_terms?.terms||[]), ...(a.index_terms?.author_terms?.terms||[])].join(', '),
    abstract: (a.abstract || '').slice(0, 500)
  }));
}

// ── SPRINGER ────────────────────────────────────────────────
async function asFetchSpringer(query, yearFrom, yearTo) {
  const key = asGetKey('springer');
  if (!key) throw new Error('API key não configurada. Clique em "Como obter cada chave" acima.');
  const results = [];
  let start = 1;
  const pageSize = 100;
  const maxPages = 5;

  for (let p = 0; p < maxPages; p++) {
    let q = query;
    if (yearFrom && yearTo) q += ` date:${yearFrom}-${yearTo}`;
    const url = `https://api.springernature.com/meta/v2/json?q=${encodeURIComponent(q)}&p=${pageSize}&s=${start}&api_key=${key}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const records = data.records || [];
    records.forEach(r => {
      results.push({
        title:   r.title || '',
        authors: (r.creators || []).map(c => c.creator || '').join(', '),
        year:    (r.publicationDate || '').slice(0, 4),
        doi:     r.doi || '',
        journal: r.publicationName || '',
        url:     r.url?.[0]?.value || (r.doi ? `https://doi.org/${r.doi}` : ''),
        keywords: (r.keyword || []).join(', '),
        abstract: (r.abstract || '').slice(0, 500)
      });
    });
    const total = parseInt(data.result?.[0]?.total || '0');
    if (records.length < pageSize || start + pageSize > total) break;
    start += pageSize;
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

// ── SCOPUS ───────────────────────────────────────────────────
async function asFetchScopus(query, yearFrom, yearTo) {
  const key = asGetKey('scopus');
  if (!key) throw new Error('API key não configurada. Clique em "Como obter cada chave" acima.');
  const results = [];
  let start = 0;
  const count = 200;
  const maxPages = 5;
  let scopusQ = `TITLE-ABS-KEY(${query})`;
  if (yearFrom) scopusQ += ` AND PUBYEAR > ${yearFrom - 1}`;
  if (yearTo)   scopusQ += ` AND PUBYEAR < ${yearTo + 1}`;

  for (let p = 0; p < maxPages; p++) {
    const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(scopusQ)}&apiKey=${key}&count=${count}&start=${start}&httpAccept=application%2Fjson&field=dc:title,dc:creator,prism:publicationName,prism:coverDate,prism:doi,authkeywords`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'X-ELS-APIKey': key } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
    }
    const data  = await res.json();
    const entries = data['search-results']?.entry || [];
    entries.forEach(e => {
      results.push({
        title:   e['dc:title']             || '',
        authors: e['dc:creator']           || '',
        year:    (e['prism:coverDate']||'').slice(0, 4),
        doi:     e['prism:doi']            || '',
        journal: e['prism:publicationName']|| '',
        url:     e['prism:doi'] ? `https://doi.org/${e['prism:doi']}` : '',
        keywords: e['authkeywords']        || '',
        abstract: ''
      });
    });
    const total = parseInt(data['search-results']?.['opensearch:totalResults'] || '0');
    if (entries.length < count || start + count >= total) break;
    start += count;
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

// ── INTEGRAÇÃO COM O APP ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!S.apiKeys)  S.apiKeys  = {};
  if (!S.settings) S.settings = { useProxy: true };

  const navList = el('nav-list');
  if (navList && !navList.querySelector('[data-view="autosearch"]')) {
    const dbItem = navList.querySelector('[data-view="databases"]');
    if (dbItem) {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.dataset.view = 'autosearch';
      li.innerHTML = `<span class="nav-num">2b</span><span class="nav-label">Auto-Busca</span><span class="nav-status" id="ns-autosearch"></span>`;
      li.addEventListener('click', () => navigate('autosearch'));
      dbItem.insertAdjacentElement('afterend', li);
    }
  }
}, { once: true });

window._autoSearchView = renderAutoSearch;

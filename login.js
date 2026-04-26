'use strict';
// ============================================================
// RSL SYSTEM — login.js
// Autenticação local com SHA-256 (credenciais nunca no Git)
// ============================================================

// ── CRYPTO ───────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function genRecoveryKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => chars[b % chars.length]).join('');
  return `RSL-${seg()}-${seg()}-${seg()}`;
}

// ── PAINEL ATIVO ─────────────────────────────────────────────
// 'login' | 'setup' | 'recovery'
let authPanel = 'login';

function showPanel(name) {
  authPanel = name;
  ['login', 'setup', 'recovery'].forEach(p => {
    const el2 = document.getElementById(`auth-panel-${p}`);
    if (el2) el2.classList.toggle('hidden', p !== name);
  });
  const focusMap = {
    login: 'login-email', setup: 'setup-email', recovery: 'recovery-key-input'
  };
  setTimeout(() => document.getElementById(focusMap[name])?.focus(), 80);
  clearAuthError();
}

function clearAuthError() {
  document.querySelectorAll('.auth-error')
    .forEach(e => { e.textContent = ''; e.classList.add('hidden'); });
}

function showAuthError(panelName, msg) {
  const errEl = document.getElementById(`${panelName}-error`);
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

// ── SESSÃO ───────────────────────────────────────────────────
function isAuthenticated() {
  return sessionStorage.getItem('rsl_auth') === 'ok';
}

function markAuthenticated() {
  sessionStorage.setItem('rsl_auth', 'ok');
}

function revealApp() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── LOGIN ────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email')?.value.trim().toLowerCase();
  const pass  = document.getElementById('login-password')?.value;
  if (!email || !pass) { showAuthError('login', 'Preencha e-mail e senha.'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Verificando…';

  try {
    const cfg = window.RSL_CONFIG;
    const eH  = await sha256(email);
    const pH  = await sha256(pass);

    if (eH === cfg.emailHash && pH === cfg.passwordHash) {
      markAuthenticated();
      revealApp();
    } else {
      showAuthError('login', 'E-mail ou senha incorretos.');
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  } catch (e) {
    showAuthError('login', 'Erro ao verificar. Recarregue a página.');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

// ── SETUP ────────────────────────────────────────────────────
let _generatedRecoveryKey = '';

async function doGenerateConfig() {
  const email   = document.getElementById('setup-email')?.value.trim().toLowerCase();
  const pass    = document.getElementById('setup-password')?.value;
  const confirm = document.getElementById('setup-confirm')?.value;

  if (!email || !pass)    { showAuthError('setup', 'Preencha e-mail e senha.'); return; }
  if (pass !== confirm)   { showAuthError('setup', 'As senhas não coincidem.'); return; }
  if (pass.length < 8)    { showAuthError('setup', 'Senha deve ter no mínimo 8 caracteres.'); return; }
  if (!email.includes('@')){ showAuthError('setup', 'E-mail inválido.'); return; }

  _generatedRecoveryKey = genRecoveryKey();
  const [eH, pH, rH] = await Promise.all([
    sha256(email), sha256(pass), sha256(_generatedRecoveryKey)
  ]);

  const configContent =
`// RSL PRISMA-ScR — config.js
// ⚠️  NÃO suba este arquivo para o Git (já está no .gitignore)
// Gerado automaticamente em ${new Date().toLocaleString('pt-BR')}

window.RSL_CONFIG = {
  emailHash:    '${eH}',
  passwordHash: '${pH}',
  recoveryHash: '${rH}'
};`;

  document.getElementById('setup-config-box').classList.remove('hidden');
  document.getElementById('setup-config-text').textContent = configContent;
  document.getElementById('setup-recovery-display').textContent = _generatedRecoveryKey;
  document.getElementById('setup-recovery-section').classList.remove('hidden');
}

function copyConfigText() {
  const txt = document.getElementById('setup-config-text')?.textContent;
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById('copy-config-btn');
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar config.js'; }, 2000);
  });
}

function copyRecoveryKey() {
  navigator.clipboard.writeText(_generatedRecoveryKey).then(() => {
    const btn = document.getElementById('copy-recovery-btn');
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar chave'; }, 2000);
  });
}

// ── RECUPERAÇÃO ──────────────────────────────────────────────
async function doRecovery() {
  const key = document.getElementById('recovery-key-input')?.value.trim().toUpperCase();
  if (!key) { showAuthError('recovery', 'Cole sua chave de recuperação.'); return; }

  const cfg = window.RSL_CONFIG;
  if (!cfg?.recoveryHash) {
    showAuthError('recovery', 'Este sistema não tem chave de recuperação configurada.');
    return;
  }

  const btn = document.getElementById('recovery-btn');
  btn.disabled = true; btn.textContent = 'Verificando…';

  try {
    const kH = await sha256(key);
    if (kH === cfg.recoveryHash) {
      // chave válida — mostra formulário de nova senha
      document.getElementById('recovery-form').classList.add('hidden');
      document.getElementById('recovery-newpass').classList.remove('hidden');
    } else {
      showAuthError('recovery', 'Chave de recuperação incorreta.');
    }
  } catch (e) {
    showAuthError('recovery', 'Erro. Tente novamente.');
  } finally {
    btn.disabled = false; btn.textContent = 'Verificar chave';
  }
}

async function doResetPassword() {
  const newPass   = document.getElementById('recovery-new-password')?.value;
  const newEmail  = document.getElementById('recovery-new-email')?.value.trim().toLowerCase();
  const newConfirm= document.getElementById('recovery-new-confirm')?.value;

  if (!newEmail || !newPass)      { showAuthError('recovery', 'Preencha e-mail e nova senha.'); return; }
  if (newPass !== newConfirm)     { showAuthError('recovery', 'As senhas não coincidem.'); return; }
  if (newPass.length < 8)         { showAuthError('recovery', 'Senha deve ter no mínimo 8 caracteres.'); return; }

  const [eH, pH] = await Promise.all([sha256(newEmail), sha256(newPass)]);
  _generatedRecoveryKey = genRecoveryKey();
  const rH = await sha256(_generatedRecoveryKey);

  const configContent =
`// RSL PRISMA-ScR — config.js  (SENHA REDEFINIDA)
// ⚠️  NÃO suba este arquivo para o Git
// Gerado em ${new Date().toLocaleString('pt-BR')}

window.RSL_CONFIG = {
  emailHash:    '${eH}',
  passwordHash: '${pH}',
  recoveryHash: '${rH}'
};`;

  document.getElementById('recovery-result').classList.remove('hidden');
  document.getElementById('recovery-result-text').textContent = configContent;
  document.getElementById('recovery-new-recovery-key').textContent = _generatedRecoveryKey;
}

function copyResetConfig() {
  const txt = document.getElementById('recovery-result-text')?.textContent;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById('copy-reset-config-btn');
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar novo config.js'; }, 2000);
  });
}

// ── UTILITÁRIOS ──────────────────────────────────────────────
function togglePassVis(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}

function doLogout() {
  sessionStorage.removeItem('rsl_auth');
  location.reload();
}

// ── INICIALIZAÇÃO ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (isAuthenticated()) { revealApp(); return; }

  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.remove('hidden');

  if (!window.RSL_CONFIG
      || window.RSL_CONFIG.emailHash?.startsWith('SUBSTITUA')) {
    showPanel('setup');
  } else {
    showPanel('login');
  }

  // Enter nas inputs de login
  ['login-email', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
  document.getElementById('recovery-key-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doRecovery();
  });
}, { once: true });

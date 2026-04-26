'use strict';
// ============================================================
// RSL SYSTEM — login.js  (OTP via EmailJS)
// ============================================================

const OTP_TTL_MS  = 10 * 60 * 1000; // 10 minutos
const OTP_SS_KEY  = 'rsl_otp';
const AUTH_SS_KEY = 'rsl_auth';

// ── CRYPTO ───────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function genOTP() {
  const arr = crypto.getRandomValues(new Uint32Array(1));
  return String(arr[0] % 1000000).padStart(6, '0');
}

// ── SESSÃO ───────────────────────────────────────────────────
function isAuthenticated() {
  return sessionStorage.getItem(AUTH_SS_KEY) === 'ok';
}

function markAuthenticated(email) {
  sessionStorage.setItem(AUTH_SS_KEY, 'ok');
  sessionStorage.setItem('rsl_user', email);
  sessionStorage.removeItem(OTP_SS_KEY);
}

function revealApp() {
  document.getElementById('auth-overlay')?.classList.add('hidden');
}

function doLogout() {
  sessionStorage.clear();
  location.reload();
}

// ── PAINEL ───────────────────────────────────────────────────
let _currentEmail = '';

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

function showOTPPanel() {
  document.getElementById('auth-panel-email').classList.add('hidden');
  document.getElementById('auth-panel-otp').classList.remove('hidden');
  document.getElementById('otp-email-display').textContent = _currentEmail;
  setTimeout(() => document.getElementById('otp-input')?.focus(), 80);
}

function showEmailPanel() {
  document.getElementById('auth-panel-otp').classList.add('hidden');
  document.getElementById('auth-panel-email').classList.remove('hidden');
  clearAuthError('email-error');
  clearAuthError('otp-error');
  setTimeout(() => document.getElementById('auth-email-input')?.focus(), 80);
}

// ── ENVIAR OTP ───────────────────────────────────────────────
async function sendOTP() {
  const emailInput = document.getElementById('auth-email-input');
  const email = emailInput?.value.trim().toLowerCase();

  clearAuthError('email-error');

  if (!email || !email.includes('@')) {
    showAuthError('email-error', 'Informe um e-mail válido.');
    return;
  }

  const cfg = window.RSL_EMAILJS;
  if (!cfg || cfg.publicKey?.startsWith('COLE')) {
    showAuthError('email-error', 'EmailJS não configurado. Edite emailjs.config.js com suas credenciais.');
    return;
  }

  const allowed = (cfg.allowedEmails || []).map(e => e.toLowerCase());
  if (allowed.length > 0 && !allowed.includes(email)) {
    showAuthError('email-error', 'Este e-mail não tem permissão de acesso.');
    return;
  }

  const btn = document.getElementById('send-otp-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    const code = genOTP();
    const hash = await sha256(code);
    sessionStorage.setItem(OTP_SS_KEY, JSON.stringify({
      hash,
      email,
      expiresAt: Date.now() + OTP_TTL_MS
    }));

    _currentEmail = email;

    await emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: email,
      otp_code: code,
      valid_minutes: '10'
    }, { publicKey: cfg.publicKey });

    showOTPPanel();
    startCountdown();
  } catch (err) {
    console.error('EmailJS error:', err);
    showAuthError('email-error', 'Falha ao enviar e-mail. Verifique a configuração do EmailJS.');
    sessionStorage.removeItem(OTP_SS_KEY);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar código';
  }
}

// ── VERIFICAR OTP ─────────────────────────────────────────────
async function verifyOTP() {
  const input = document.getElementById('otp-input')?.value.trim();
  clearAuthError('otp-error');

  if (!input || input.length !== 6) {
    showAuthError('otp-error', 'Digite o código de 6 dígitos recebido no e-mail.');
    return;
  }

  const stored = JSON.parse(sessionStorage.getItem(OTP_SS_KEY) || 'null');
  if (!stored) {
    showAuthError('otp-error', 'Sessão expirada. Solicite um novo código.');
    showEmailPanel();
    return;
  }

  if (Date.now() > stored.expiresAt) {
    showAuthError('otp-error', 'Código expirado. Solicite um novo.');
    sessionStorage.removeItem(OTP_SS_KEY);
    showEmailPanel();
    return;
  }

  const btn = document.getElementById('verify-otp-btn');
  btn.disabled = true;
  btn.textContent = 'Verificando…';

  try {
    const hash = await sha256(input);
    if (hash === stored.hash) {
      markAuthenticated(stored.email);
      revealApp();
    } else {
      showAuthError('otp-error', 'Código incorreto. Tente novamente.');
      document.getElementById('otp-input').value = '';
      document.getElementById('otp-input').focus();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

// ── REENVIAR / CONTADOR ───────────────────────────────────────
let _countdownTimer = null;

function startCountdown() {
  clearInterval(_countdownTimer);
  let secs = 60;
  const resendBtn = document.getElementById('resend-btn');
  const counter   = document.getElementById('resend-counter');
  if (resendBtn) resendBtn.disabled = true;
  if (counter)   counter.textContent = `(${secs}s)`;

  _countdownTimer = setInterval(() => {
    secs--;
    if (counter) counter.textContent = secs > 0 ? `(${secs}s)` : '';
    if (secs <= 0) {
      clearInterval(_countdownTimer);
      if (resendBtn) resendBtn.disabled = false;
    }
  }, 1000);
}

function resendOTP() {
  document.getElementById('otp-input').value = '';
  clearAuthError('otp-error');
  showEmailPanel();
  document.getElementById('auth-email-input').value = _currentEmail;
}

// ── INICIALIZAÇÃO ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (isAuthenticated()) { revealApp(); return; }

  document.getElementById('auth-overlay')?.classList.remove('hidden');
  showEmailPanel();

  document.getElementById('auth-email-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendOTP();
  });
  document.getElementById('otp-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyOTP();
  });
  // auto-avança ao completar 6 dígitos
  document.getElementById('otp-input')?.addEventListener('input', e => {
    if (e.target.value.length === 6) verifyOTP();
  });
}, { once: true });

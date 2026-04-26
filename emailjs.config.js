// ============================================================
// emailjs.config.js — configuração do serviço de e-mail OTP
// ✅  SEGURO para o Git — EmailJS public keys são públicas por
//    design; a segurança vem da restrição de domínio no painel
//    do EmailJS e da lista de e-mails autorizados abaixo.
// ============================================================

window.RSL_EMAILJS = {
  publicKey:  'COLE_SUA_PUBLIC_KEY_AQUI',   // Account > API Keys
  serviceId:  'COLE_SEU_SERVICE_ID_AQUI',   // Email Services > Service ID
  templateId: 'COLE_SEU_TEMPLATE_ID_AQUI',  // Email Templates > Template ID

  // Apenas estes e-mails podem fazer login (minúsculas)
  allowedEmails: [
    'seu@email.com'
  ]
};

// ============================================================
// emailjs.config.js — configuração do serviço de e-mail OTP
// ✅  SEGURO para o Git — EmailJS public keys são públicas por
//    design; a segurança vem da restrição de domínio no painel
//    do EmailJS e da lista de e-mails autorizados abaixo.
// ============================================================

window.RSL_EMAILJS = {
  publicKey:  '1huL_8JCDABijL6pU',   // Account > API Keys
  serviceId:  'service_q2s23ig',   // Email Services > Service ID
  templateId: 'template_p5ise8y',  // Email Templates > Template ID

  // Apenas estes e-mails podem fazer login (minúsculas)
  allowedEmails: [
    'acs3@ecomp.poli.br'
  ]
};

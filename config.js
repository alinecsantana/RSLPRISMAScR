// ============================================================
// config.example.js — TEMPLATE DE CONFIGURAÇÃO
// ============================================================
// 1. COPIE este arquivo como "config.js" (mesmo diretório)
// 2. Use a tela de Setup do sistema para gerar seus hashes
// 3. Substitua os valores abaixo pelos hashes gerados
// 4. NUNCA suba "config.js" para o Git (já está no .gitignore)
//
// Este arquivo (config.example.js) é seguro para o Git —
// ele contém apenas um template sem credenciais reais.
// ============================================================

window.RSL_CONFIG = {
  // SHA-256 do seu e-mail (em minúsculas)
  emailHash: 'cavalcantalines@gmail.com',

  // SHA-256 da sua senha
  passwordHash: 'SUBSTITUA_PELO_HASH_DA_SUA_SENHA',

  // SHA-256 da chave de recuperação gerada no setup
  recoveryHash: 'RSL-HTJW-4HMV-YU7Q'
};

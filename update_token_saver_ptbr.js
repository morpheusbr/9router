const fs = require('fs');
const path = 'public/i18n/literals/pt-BR.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const newKeys = {
  "Token Saver": "Economia de Tokens",
  "Compress tool output": "Comprimir saída de ferramentas",
  "git/grep/ls/tree/logs → 60-90% fewer input tokens": "git/grep/ls/tree/logs → 60-90% menos tokens de entrada",
  "Compress context": "Comprimir contexto",
  "Compress prompts via /v1/compress before routing to the model": "Comprimir prompts via /v1/compress antes de enviar ao modelo",
  "Compress LLM output": "Comprimir saída do LLM",
  "Terse-style system prompt → ~65% fewer output tokens (up to 87%)": "Prompt de sistema conciso → ~65% menos tokens de saída (até 87%)",
  "Lazy senior dev": "Desenvolvedor sênior preguiçoso",
  "Bias the model toward minimal code: YAGNI, reuse stdlib, deletion over addition": "Viesar o modelo para código mínimo: YAGNI, reuso de stdlib, exclusão sobre adição",

  "Not installed": "Não instalado",
  "Stopped": "Parado",
  "External": "Externo",
  "Checking…": "Verificando…",
  "Running": "Executando",
  "Installing…": "Instalando…",
  "Healthy": "Saudável",
  "Manage": "Gerenciar",
  "Setup": "Configurar",
  
  "Lite": "Leve",
  "Full": "Completo",
  "Ultra": "Ultra",
  "Drop filler, keep grammar": "Remover preenchimento, manter gramática",
  "Drop articles, fragments OK": "Remover artigos, fragmentos são OK",
  "Telegraphic, max compression": "Telegráfico, compressão máxima",
  "Build asked, name lazier option": "Construir o solicitado, sugerir opção mais preguiçosa",
  "Ladder enforced: stdlib/native first": "Escada imposta: stdlib/nativo primeiro",
  "YAGNI extremist, deletion first": "Extremista YAGNI, exclusão primeiro"
};

let updated = false;
for (const [k, v] of Object.entries(newKeys)) {
  if (!data[k]) {
    data[k] = v;
    updated = true;
  }
}

if (updated) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log('Added missing Token Saver keys to pt-BR.json');
} else {
  console.log('Keys already present');
}

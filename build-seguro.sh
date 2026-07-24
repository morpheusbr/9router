#!/bin/bash

# ==============================================================================
# build-seguro.sh (HiperRouter)
# Script para realizar o build do Next.js utilizando uma pasta paralela (-build)
# ==============================================================================

REPO_DIR="/home/www/HiperRouter"
BUILD_DIR="/home/www/HiperRouter-build"
PROD_DIR="$REPO_DIR"

echo "🚀 Iniciando Deploy Seguro (Zero Downtime) via $BUILD_DIR..."
echo "--------------------------------------------------------"

if [ ! -d "$REPO_DIR" ]; then
  echo "❌ ERRO: Diretório $REPO_DIR não encontrado!"
  exit 1
fi

echo "📂 Criando ambiente isolado de compilação (-build)..."
# Sincroniza o laboratório para a pasta de build
# Ignoramos a pasta .9router (banco de dados) e cli/app (compilados atuais)
rsync -a --delete \
  --exclude='.git' \
  --exclude='cli/app' \
  --exclude='.9router' \
  "$REPO_DIR/" "$BUILD_DIR/"

cd "$BUILD_DIR" || exit 1

echo "📦 Instalando dependências e compilando o projeto..."

# Garante que o SQLite mockado seja instalado para não quebrar o build do Next.js
npm install better-sqlite3 --ignore-scripts --no-save

# Roda o script oficial de build da CLI
BUILD_LOG="build.log"
npm --prefix cli run build 2>&1 | tee "$BUILD_LOG"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "--------------------------------------------------------"
  echo "❌ ERRO: O build falhou! O sistema em produção NÃO foi afetado."
  echo "📄 Analise os erros em $BUILD_DIR/$BUILD_LOG"
  echo "--------------------------------------------------------"
  exit 1
fi

echo "✅ Build concluído com sucesso!"
rm -f "$BUILD_LOG"

echo "🔄 Transferindo a nova versão compilada de volta para o diretório de produção..."

# Transfere o app compilado de volta para o diretório raiz
# Usamos mkdir -p para garantir que a estrutura base exista
mkdir -p "$PROD_DIR/cli"
rsync -a --delete \
  "$BUILD_DIR/cli/app" "$PROD_DIR/cli/"

# Não esquecemos de também copiar outras dependências da CLI se necessárias (opcional, o app já é standalone)
# rsync -a "$BUILD_DIR/cli/package.json" "$PROD_DIR/cli/"

cd "$PROD_DIR" || exit 1

echo "⚡ Atualizando o servidor em produção (PM2)..."
# Tentamos recarregar o processo existente, caso falhe iniciamos/reiniciamos o ecosystem
pm2 reload HiperRouter || pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "🧹 Limpando o cache do NGINX (aaPanel)..."
if [ -d "/www/server/nginx/proxy_cache_dir" ]; then
  rm -rf /www/server/nginx/proxy_cache_dir/*
fi
systemctl reload nginx || service nginx reload

echo "🧠 Atualizando Knowledge Graph (Graphify)..."
graphify update . || echo "⚠️ Graphify não atualizado."

echo "--------------------------------------------------------"
echo "🎉 Deploy Seguro finalizado! Sistema e banco de dados preservados na pasta HiperRouter."

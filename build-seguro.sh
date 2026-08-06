#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy isolado do HiperRouter. O diretório de produção só é alterado depois
# que o build e a suíte do CLI terminam com sucesso.
REPO_DIR="${HIPERROUTER_REPO_DIR:-/home/www/HiperRouter}"
BUILD_DIR="${HIPERROUTER_BUILD_DIR:-/home/www/HiperRouter-build}"
PROD_DIR="$REPO_DIR"
APP_DIR="$PROD_DIR/cli/app"
BUILD_APP_DIR="$BUILD_DIR/cli/app"
BACKUP_ROOT="$PROD_DIR/.deploy-backups"
LOCK_FILE="$PROD_DIR/.deploy.lock"
HEALTH_URL="${HIPERROUTER_HEALTH_URL:-http://127.0.0.1:20128/api/health}"
SERVER_HOST="${HIPERROUTER_SERVER_HOST:-0.0.0.0}"
DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$DEPLOY_ID"
BUILD_LOG="$BUILD_DIR/build-$DEPLOY_ID.log"
DEPLOY_STARTED=0

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERRO: $*"; exit 1; }

on_exit() {
  local exit_code=$?
  trap - EXIT
  if [[ "$DEPLOY_STARTED" != "1" || ! -d "$BACKUP_DIR" ]]; then
    exit "$exit_code"
  fi

  log "Falha pós-deploy detectada. Restaurando backup $BACKUP_DIR..."
  if rsync -a --delete "$BACKUP_DIR/" "$APP_DIR/"; then
    pm2 reload HiperRouter --update-env >/dev/null 2>&1 || true
    log "Rollback concluído. O código anterior foi restaurado."
  else
    log "ERRO CRÍTICO: rollback também falhou. Backup preservado em $BACKUP_DIR"
  fi
  exit "$exit_code"
}

trap on_exit EXIT

[[ -d "$REPO_DIR" ]] || fail "Diretório do repositório não encontrado: $REPO_DIR"
[[ "$REPO_DIR" != "$BUILD_DIR" ]] || fail "REPO_DIR e BUILD_DIR não podem ser iguais"
command -v rsync >/dev/null || fail "rsync não encontrado"
command -v npm >/dev/null || fail "npm não encontrado"
command -v pm2 >/dev/null || fail "pm2 não encontrado"
command -v curl >/dev/null || fail "curl não encontrado"
[[ "${API_KEY_SECRET:-}" =~ ^.{32,}$ ]] \
  || fail "API_KEY_SECRET ausente ou menor que 32 caracteres; deploy cancelado"

mkdir -p "$BACKUP_ROOT"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Já existe outro deploy em execução: $LOCK_FILE"

log "Iniciando deploy seguro $DEPLOY_ID"
log "Sincronizando workspace isolado: $BUILD_DIR"
rsync -a --delete \
  --exclude='.git' \
  --exclude='cli/app' \
  --exclude='.HiperRouter' \
  --exclude='.deploy-backups' \
  --exclude='.deploy.lock' \
  "$REPO_DIR/" "$BUILD_DIR/"

cd "$BUILD_DIR"
log "Instalando dependências de forma reproduzível"
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix cli ci --ignore-scripts --no-audit --no-fund

log "Executando testes do CLI"
npm --prefix cli test

log "Compilando aplicação e CLI"
npm --prefix cli run build 2>&1 | tee "$BUILD_LOG"
[[ -f "$BUILD_APP_DIR/custom-server.js" || -f "$BUILD_APP_DIR/server.js" ]] \
  || fail "Build concluído sem servidor standalone em $BUILD_APP_DIR"

log "Normalizando caminhos absolutos do artefato standalone"
find "$BUILD_APP_DIR" -type f \( -name '*.js' -o -name '*.json' \) \
  -exec sed -i "s|$BUILD_DIR|$PROD_DIR|g" {} +

log "Criando backup da versão atualmente publicada"
mkdir -p "$BACKUP_DIR"
if [[ -d "$APP_DIR" ]]; then
  rsync -a "$APP_DIR/" "$BACKUP_DIR/"
else
  fail "Aplicação em produção não encontrada: $APP_DIR"
fi

log "Publicando artefato compilado"
DEPLOY_STARTED=1
rsync -a --delete "$BUILD_APP_DIR/" "$APP_DIR/"

log "Recarregando PM2"
if pm2 describe HiperRouter >/dev/null 2>&1; then
  HOSTNAME="$SERVER_HOST" PORT=20128 pm2 reload HiperRouter --update-env
else
  HOSTNAME="$SERVER_HOST" PORT=20128 pm2 start "$PROD_DIR/ecosystem.config.js" --update-env
fi

log "Validando health check: $HEALTH_URL"
healthy=0
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
[[ "$healthy" == "1" ]] || fail "Health check não passou após o reload"

log "Limpando cache do NGINX após health check"
CACHE_DIR="/www/server/nginx/proxy_cache_dir"
if [[ -d "$CACHE_DIR" && "$CACHE_DIR" == "/www/server/nginx/proxy_cache_dir" ]]; then
  rm -rf -- "$CACHE_DIR"/*
fi
if command -v systemctl >/dev/null; then
  systemctl reload nginx || log "Aviso: não foi possível recarregar o NGINX"
else
  service nginx reload || log "Aviso: não foi possível recarregar o NGINX"
fi

cd "$PROD_DIR"
graphify update --force . || log "Aviso: Graphify não atualizado"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +7 \
  -exec rm -rf -- {} + || log "Aviso: não foi possível limpar backups antigos"
rm -f "$BUILD_LOG" || log "Aviso: não foi possível remover o log do build"
DEPLOY_STARTED=0
log "Deploy $DEPLOY_ID concluído com sucesso"

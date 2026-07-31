const api = require("../api/client");
const { confirm, pause } = require("../utils/input");
const { showStatus } = require("../utils/display");
const { showMenuWithBack } = require("../utils/menuHelper");

// ANSI colors
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m"
};

const DEFAULT_PASSWORD = "123456";

/**
 * Show settings menu (tunnel + RTK + reset password)
 * @param {Array<string>} breadcrumb - Breadcrumb path
 */
async function showSettingsMenu(breadcrumb = []) {
  await showMenuWithBack({
    title: "⚙️  Settings",
    breadcrumb,
    headerContent: async (data) => {
      const lines = [];

      // Tunnel section
      const tunnel = data?.tunnel || {};
      if (tunnel.enabled && tunnel.publicUrl) {
        lines.push(`  Endpoint: ${COLORS.green}${tunnel.publicUrl}/v1${COLORS.reset}`);
        lines.push(`  Tunnel:   ${COLORS.green}ON${COLORS.reset} ${COLORS.dim}(${tunnel.shortId})${COLORS.reset}`);
      } else {
        lines.push(`  Endpoint: http://localhost:20128/v1`);
        lines.push(`  Tunnel:   ${COLORS.red}OFF${COLORS.reset} ${COLORS.dim}(local only)${COLORS.reset}`);
      }

      // RTK section
      const rtkOn = data?.settings?.rtkEnabled !== false;
      lines.push(`  RTK:      ${rtkOn ? `${COLORS.green}ON${COLORS.reset}` : `${COLORS.red}OFF${COLORS.reset}`} ${COLORS.dim}(Token Saver)${COLORS.reset}`);
      const headroomOn = data?.settings?.headroomEnabled === true;
      lines.push(`  Headroom: ${headroomOn ? `${COLORS.green}ON${COLORS.reset}` : `${COLORS.red}OFF${COLORS.reset}`} ${COLORS.dim}(${data?.settings?.headroomUrl || "http://localhost:8787"})${COLORS.reset}`);

      // Auth mode section
      const authMode = data?.settings?.authMode || "password";
      const authColor = authMode === "password" ? COLORS.green : COLORS.yellow;
      lines.push(`  Auth:     ${authColor}${authMode.toUpperCase()}${COLORS.reset} ${COLORS.dim}(login mode)${COLORS.reset}`);

      return lines.join("\n");
    },
    refresh: async () => {
      const [tunnelRes, settingsRes] = await Promise.all([
        api.getTunnelStatus(),
        api.getSettings()
      ]);
      return {
        tunnel: tunnelRes.success ? (tunnelRes.data || {}) : {},
        settings: settingsRes.success ? (settingsRes.data || {}) : {}
      };
    },
    items: [
      {
        label: "Tunnel ON",
        action: async () => { await enableTunnel(); return true; }
      },
      {
        label: "Tunnel OFF",
        action: async () => { await disableTunnel(); return true; }
      },
      {
        label: (d) => {
          const on = d?.settings?.rtkEnabled !== false;
          return `Token Saver (RTK): ${on ? "ON" : "OFF"} → toggle`;
        },
        action: async (d) => { await toggleRtk(d?.settings?.rtkEnabled !== false); return true; }
      },
      {
        label: (d) => {
          const on = d?.settings?.headroomEnabled === true;
          return `Token Saver (Headroom): ${on ? "ON" : "OFF"} → toggle`;
        },
        action: async (d) => { await toggleHeadroom(d?.settings?.headroomEnabled === true); return true; }
      },
      {
        label: "🔑 Reset Password to Default (123456)",
        action: async () => { await resetPassword(); return true; }
      },
      {
        label: "✏️  Change Dashboard Password",
        action: async () => { await changeCustomPassword(); return true; }
      },
      {
        label: "💾 Export Database Backup (.sqlite)",
        action: async () => { await exportDatabaseBackup(); return true; }
      },
      {
        label: () => {
          const mode = require("../utils/configStore").get("autoApproveMode", "ask");
          const labels = { ask: "❓ Sempre Perguntar (y/n)", patches: "⚡ Auto-Aprovar Edições de Código", all: "🚀 Auto-Aprovar Tudo (Edições + Comandos)" };
          return `🛡️ Aprovação de Edições: ${labels[mode] || labels.ask} → Change`;
        },
        action: async () => { await changeAutoApproveSetting(); return true; }
      },
      {
        label: () => {
          const locale = require("../utils/locale");
          const current = locale.getActiveLanguage();
          const mode = require("../utils/configStore").get("language", "auto");
          return `🌐 Language / Idioma: ${current} (Mode: ${mode.toUpperCase()}) → Change`;
        },
        action: async () => { await changeLanguageSetting(); return true; }
      },
      {
        label: (d) => {
          const mode = d?.settings?.authMode || "password";
          return mode === "password" ? "🔓 Reset Auth Mode (already password)" : `🔓 Reset Auth Mode to Password (current: ${mode})`;
        },
        action: async () => { await resetAuthMode(); return true; }
      }
    ]
  });
}

async function changeAutoApproveSetting() {
  const { selectMenu, pause } = require("../utils/input");
  const configStore = require("../utils/configStore");

  const items = [
    { label: "❓ Sempre Perguntar antes de cada edição ou comando (Padrão de Segurança)", mode: "ask" },
    { label: "⚡ Auto-Aprovar Edições de Arquivos e Patches (Pergunta apenas comandos bash)", mode: "patches" },
    { label: "🚀 Auto-Aprovar TUDO sem interrupção (Modo Autônomo Total)", mode: "all" }
  ];

  const idx = await selectMenu("Modo de Aprovação de Edições no Chat", items, 0, "Escolha o nível de autonomia do agente:");
  if (idx !== -1) {
    const selected = items[idx];
    configStore.set("autoApproveMode", selected.mode);
    showStatus(`Modo de aprovação alterado para: ${selected.label}`, "success");
    await pause();
  }
}

async function changeLanguageSetting() {
  const { selectMenu, pause } = require("../utils/input");
  const locale = require("../utils/locale");

  const items = [
    { label: "🖥️ Auto-detect System OS Language (Detecção Automática)", lang: "auto" },
    { label: "🇧🇷 Português (pt-BR)", lang: "pt-BR" },
    { label: "🇺🇸 English (en-US)", lang: "en-US" }
  ];

  const idx = await selectMenu("Idioma do CLI / CLI Language", items, 0, "Escolha o idioma do sistema:");
  if (idx !== -1) {
    const selected = items[idx];
    locale.setLanguage(selected.lang);
    showStatus(`Idioma alterado para / Language set to: ${selected.lang.toUpperCase()}`, "success");
    await pause();
  }
}

/**
 * Reset authMode to "password" via API. Used when OIDC is misconfigured
 * and user is locked out of dashboard. CLI bypasses auth via x-9r-cli-token.
 */
async function resetAuthMode() {
  const ok = await confirm("Reset auth mode to PASSWORD (disable OIDC)?");
  if (!ok) {
    showStatus("Cancelled", "info");
    await pause();
    return;
  }

  const result = await api.updateSettings({ authMode: "password" });
  if (result.success) {
    showStatus("Auth mode reset to password. OIDC disabled.", "success");
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }
  await pause();
}

/**
 * Enable tunnel via API
 */
async function enableTunnel() {
  showStatus("Creating tunnel...", "info");
  const result = await api.enableTunnel();

  if (result.success) {
    const { publicUrl, shortId, alreadyRunning } = result.data || {};
    if (alreadyRunning) {
      showStatus(`Tunnel already running: ${publicUrl}`, "success");
    } else {
      showStatus(`Tunnel enabled: ${publicUrl} (${shortId})`, "success");
    }
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }

  await pause();
}

/**
 * Disable tunnel via API
 */
async function disableTunnel() {
  const result = await api.disableTunnel();

  if (result.success) {
    showStatus("Tunnel disabled", "success");
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }

  await pause();
}

/**
 * Toggle RTK (Token Saver) via API
 * @param {boolean} currentlyOn
 */
async function toggleRtk(currentlyOn) {
  const next = !currentlyOn;
  const result = await api.updateSettings({ rtkEnabled: next });
  if (result.success) {
    showStatus(`Token Saver ${next ? "enabled" : "disabled"}`, "success");
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }
  await pause();
}

async function toggleHeadroom(currentlyOn) {
  const next = !currentlyOn;
  const result = await api.updateSettings({ headroomEnabled: next });
  if (result.success) {
    showStatus(`Headroom ${next ? "enabled" : "disabled"}`, "success");
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }
  await pause();
}

/**
 * Reset dashboard password to default via server API (writes the live SQLite DB).
 * After reset, user can log in with the default password "123456".
 */
async function resetPassword() {
  const ok = await confirm(`Reset dashboard password to default "${DEFAULT_PASSWORD}"?`);
  if (!ok) {
    showStatus("Cancelled", "info");
    await pause();
    return;
  }

  const result = await api.resetPassword();
  if (result.success) {
    showStatus(`Password reset. Default: ${DEFAULT_PASSWORD}`, "success");
  } else {
    showStatus(`Failed to reset password: ${result.error}`, "error");
  }
  await pause();
}

async function changeCustomPassword() {
  const { prompt } = require("../utils/input");
  const newPass = await prompt("Digite a nova senha para o Dashboard: ");
  if (!newPass) {
    showStatus("Cancelado", "info");
    await pause();
    return;
  }
  const result = await api.updateSettings({ password: newPass });
  if (result.success) {
    showStatus("Senha do Dashboard alterada com sucesso!", "success");
  } else {
    showStatus(`Falha ao alterar senha: ${result.error}`, "error");
  }
  await pause();
}

async function exportDatabaseBackup() {
  const fs = require("fs");
  const path = require("path");
  const { getCliDataDir } = require("../constants");
  const dbPath = path.join(getCliDataDir(), "db", "data.sqlite");
  if (!fs.existsSync(dbPath)) {
    showStatus("Banco de dados SQLite não encontrado.", "error");
    await pause();
    return;
  }
  const destDir = path.join(getCliDataDir(), "backups");
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const time = new Date().toISOString().replace(/[:.]/g, "-");
  const destPath = path.join(destDir, `database-backup-${time}.sqlite`);
  fs.copyFileSync(dbPath, destPath);
  showStatus(`Backup exportado: ${destPath}`, "success");
  await pause();
}

module.exports = { showSettingsMenu };

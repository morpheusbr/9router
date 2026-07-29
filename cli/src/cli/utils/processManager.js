const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Get app data dir
function getAppDataDir() {
  const { getCliDataDir } = require("../constants");
  return getCliDataDir();
}

// Kill PID from file — SIGTERM first, SIGKILL after 3s if still alive
function killByPidFile(pidFile) {
  try {
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
        if (!waitForExit(pid, 3000)) {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
        }
      } else {
        process.kill(pid, "SIGTERM");
        if (!waitForExit(pid, 3000)) {
          process.kill(pid, "SIGKILL");
        }
      }
    } catch { }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
}

// Kill tunnel processes (cloudflared/tailscale) by their PID files
function killTunnelByPidFile() {
  const tunnelDir = path.join(getAppDataDir(), "tunnel");
  killByPidFile(path.join(tunnelDir, "cloudflared.pid"));
  killByPidFile(path.join(tunnelDir, "tailscale.pid"));
}

// Kill cloudflared whose --url targets this app's port (covers stale PID file case)
function killCloudflaredByAppPort(appPort) {
  if (!appPort) return [];
  const portMatchers = [`localhost:${appPort}`, `127.0.0.1:${appPort}`];
  const pids = [];
  try {
    if (process.platform === "win32") {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"cloudflared.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
      const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const lines = output.split("\n").slice(1).filter(l => l.trim());
      lines.forEach(line => {
        if (portMatchers.some(m => line.includes(m))) {
          const match = line.match(/^"(\d+)"/);
          if (match && match[1]) pids.push(match[1]);
        }
      });
    } else {
      const output = execSync("ps -eo pid,command 2>/dev/null", { encoding: "utf8", timeout: 5000 });
      output.split("\n").forEach(line => {
        if (line.includes("cloudflared") && portMatchers.some(m => line.includes(m))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[0];
          if (pid && !isNaN(pid)) pids.push(pid);
        }
      });
    }
  } catch { }
  return pids;
}

// Sleep helper using SharedArrayBuffer wait (sync, no busy-loop)
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

// Wait until process dies or timeout reached
function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    sleepSync(100);
  }
  return false;
}

// Kill MIT server by PID file (runs privileged, needs special handling)
function killProxyByPidFile() {
  try {
    const pidFile = path.join(getAppDataDir(), "mitm", ".mitm.pid");
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;

    if (process.platform === "win32") {
      try { execSync(`taskkill /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 2000 }); } catch { }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
      if (!waitForExit(pid, 500)) {
        try { execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${pid} -Force"`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
    } else {
      try { execSync(`sudo -n kill -TERM ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
      catch { try { process.kill(pid, "SIGTERM"); } catch { } }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`sudo -n kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
        catch { try { process.kill(pid, "SIGKILL"); } catch { } }
      }
    }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
}

// Kill all 9router processes
function killAllAppProcesses(appPort) {
  return new Promise((resolve) => {
    try {
      setImmediate(() => {
        try { killProxyByPidFile(); } catch {}
        try { killTunnelByPidFile(); } catch {}
        try { killCloudflaredByAppPort(appPort); } catch {}
      });

      const platform = process.platform;
      let pids = [];

      if (platform === "win32") {
        try {
          const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"node.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
          const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
          const lines = output.split("\n").slice(1).filter(l => l.trim());
          lines.forEach(line => {
            const cmd = line.toLowerCase();
            const isAppProcess =
              (cmd.includes("node") && cmd.includes("hiperrouter") && (cmd.includes("cli.js") || cmd.includes("\\hiperrouter") || cmd.includes("/hiperrouter")))
              || cmd.includes("next-server");
            if (isAppProcess) {
              const match = line.match(/^"(\d+)"/);
              if (match && match[1] && match[1] !== process.pid.toString()) {
                pids.push(match[1]);
              }
            }
          });
        } catch (e) { }
      } else {
        try {
          const output = execSync('ps aux 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
          const lines = output.split('\n');
          lines.forEach(line => {
            const cmd = line.toLowerCase();
            const isAppProcess =
              (cmd.includes("node") && cmd.includes("hiperrouter") && (cmd.includes("cli.js") || cmd.includes("/hiperrouter")))
              || cmd.includes("next-server");
            if (isAppProcess) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[1];
              if (pid && !isNaN(pid) && pid !== process.pid.toString()) {
                pids.push(pid);
              }
            }
          });
        } catch (e) { }
      }

      if (pids.length > 0) {
        const TERM_TIMEOUT = 3000;
        pids.forEach(pid => {
          const safePid = parseInt(pid, 10);
          if (isNaN(safePid) || safePid <= 0) return; // rejeitar PIDs inválidos
          try {
            if (platform === "win32") {
              execSync(`taskkill /PID ${safePid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
              if (!waitForExit(safePid, TERM_TIMEOUT)) {
                execSync(`taskkill /F /PID ${safePid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
              }
            } else {
              // SIGTERM primeiro — graceful shutdown
              process.kill(safePid, 'SIGTERM');
              if (!waitForExit(safePid, TERM_TIMEOUT)) {
                process.kill(safePid, 'SIGKILL');
              }
            }
          } catch (err) { }
        });
        setTimeout(() => resolve(), 1000);
      } else {
        resolve();
      }
    } catch (err) {
      resolve();
    }
  });
}

// Kill any process on specific port
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    try {
      const platform = process.platform;
      let pid;

      if (platform === "win32") {
        try {
          const output = execSync(`netstat -ano | findstr :${port}`, {
            encoding: 'utf8', shell: true, windowsHide: true, timeout: 5000
          }).trim();
          const lines = output.split('\n').filter(l => l.includes('LISTENING'));
          if (lines.length > 0) {
            pid = lines[0].trim().split(/\s+/).pop();
            execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
          }
        } catch (e) { }
      } else {
        try {
          const pidOutput = execSync(`lsof -ti:${port}`, {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
          }).trim();
          if (pidOutput) {
            // Validar PID antes de usar — lsof pode retornar múltiplos PIDs
            const safePid = parseInt(pidOutput.split('\n')[0], 10);
            if (!isNaN(safePid) && safePid > 0) {
              process.kill(safePid, 'SIGKILL'); // sem shell, sem injeção
            }
          }
        } catch (e) { }
      }
      setTimeout(() => resolve(), 500);
    } catch (err) {
      resolve();
    }
  });
}

module.exports = {
  killAllAppProcesses,
  killProcessOnPort,
  killProxyByPidFile,
  killTunnelByPidFile
};

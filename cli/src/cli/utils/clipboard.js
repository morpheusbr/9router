const { execSync } = require("child_process");

/**
 * Copy text to clipboard based on OS
 * @param {string} text - Text to copy
 * @returns {boolean} Success status
 */
function copyToClipboard(text) {
  try {
    const platform = process.platform;
    
    if (platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else if (platform === "win32") {
      execSync("clip", { input: text });
    } else {
      // Linux - try xclip first, then xsel
      try {
        execSync("xclip -selection clipboard", { input: text });
      } catch {
        execSync("xsel --clipboard --input", { input: text });
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

const fs = require("fs");
const path = require("path");

/**
 * Capture PNG image from system clipboard and save to temporary file
 * @returns {string|null} Path to saved PNG file or null if no image in clipboard
 */
function getImageFromClipboard() {
  const tmpDir = path.resolve(process.cwd(), "scripts");
  if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(e) {}
  }
  const imgPath = path.join(tmpDir, `clipboard_${Date.now()}.png`);

  try {
    const platform = process.platform;
    if (platform === "darwin") {
      try {
        execSync(`pngpaste "${imgPath}" 2>/dev/null`);
      } catch {
        const osaScript = `set currentFile to (open for access POSIX file "${imgPath}" with write permission)\ntry\nwrite (the clipboard as «class PNGf») to currentFile\nclose access currentFile\non error\nclose access currentFile\nend try`;
        execSync(`osascript -e '${osaScript}' 2>/dev/null`);
      }
    } else if (platform === "win32") {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $img.Save('${imgPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png) }"`;
      execSync(psCmd, { stdio: "ignore", windowsHide: true, timeout: 5000 });
    } else {
      // Linux - try wl-paste (Wayland) then xclip (X11)
      try {
        execSync(`wl-paste -t image/png > "${imgPath}" 2>/dev/null`);
      } catch {
        execSync(`xclip -selection clipboard -t image/png -o > "${imgPath}" 2>/dev/null`);
      }
    }

    if (fs.existsSync(imgPath) && fs.statSync(imgPath).size > 100) {
      return imgPath;
    }
    return null;
  } catch (e) {
    if (fs.existsSync(imgPath)) try { fs.unlinkSync(imgPath); } catch(err) {}
    return null;
  }
}

module.exports = { copyToClipboard, getImageFromClipboard };

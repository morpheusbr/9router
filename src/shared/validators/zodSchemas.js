import { z } from "zod";
import { URL } from "url";

// Utility to check if a hostname is an internal/private IP or localhost
export function isInternalHost(hostname) {
  if (!hostname) return false;
  
  // Normalize hostname
  const host = hostname.toLowerCase().trim();
  
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    return true;
  }
  
  // Basic Regex for IPv4
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = host.match(ipv4Regex);
  
  if (match) {
    const parts = match.slice(1).map(Number);
    // 10.x.x.x
    if (parts[0] === 10) return true;
    // 192.168.x.x
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 172.16.x.x - 172.31.x.x
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }
  
  // Could add basic protection against nip.io/sslip.io if needed,
  // but this covers the primary direct SSRF targets.
  return false;
}

/**
 * Zod schema for a URL that specifically blocks Server-Side Request Forgery (SSRF)
 * by rejecting local/private network hosts.
 */
export const safeUrlSchema = z.string().url().refine(
  (val) => {
    try {
      const url = new URL(val);
      return !isInternalHost(url.hostname);
    } catch {
      return false; // Should not happen due to .url()
    }
  },
  { message: "URL cannot point to a local or private network address (SSRF Protection)" }
);

// Generic Reusable Schemas
export const dbIdSchema = z.string().min(1, "ID is required").max(100);

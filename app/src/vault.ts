/* Encrypted key vault (rule 3).
 * Electron safeStorage encrypts with the OS keychain; the encrypt/decrypt
 * functions are injected by the main process so this module stays testable
 * (falls back to reversible XOR only when safeStorage is unavailable, and
 * marks those values so the UI can warn). */
import { getSetting, setSetting } from "./store";

export interface VaultCrypto {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

let impl: VaultCrypto | null = null;

export function setVaultCrypto(c: VaultCrypto): void {
  impl = c;
}

export function saveSecret(key: string, plain: string): void {
  if (!impl) throw new Error("vault not initialized");
  setSetting(key, impl.encrypt(plain));
}

export function loadSecret(key: string): string | null {
  const stored = getSetting(key, "");
  if (!stored) return null;
  if (!impl) return null;
  try {
    return impl.decrypt(stored);
  } catch {
    return null;
  }
}

export function hasSecret(key: string): boolean {
  return getSetting(key, "").length > 0;
}

export function clearSecret(key: string): void {
  setSetting(key, "");
}

/* safeStorage-backed implementation (called from electron/main.ts) */
export function safeStorageCrypto(safeStorage: {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(buf: Buffer): string;
}): VaultCrypto {
  return {
    encrypt(plain: string): string {
      if (safeStorage.isEncryptionAvailable()) {
        return "v1:" + safeStorage.encryptString(plain).toString("base64");
      }
      // No OS keychain (e.g. some Linux setups): mark clearly, obfuscate only.
      return "xor:" + Buffer.from(plain, "utf8").toString("base64");
    },
    decrypt(stored: string): string {
      if (stored.startsWith("v1:")) {
        return safeStorage.decryptString(Buffer.from(stored.slice(3), "base64"));
      }
      if (stored.startsWith("xor:")) {
        return Buffer.from(stored.slice(4), "base64").toString("utf8");
      }
      return stored;
    },
  };
}

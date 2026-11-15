// Mizan Care Local Encrypted Vault (vault.ts)

export async function encryptLocalData(data: string, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const encoded = enc.encode(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    (encoded as unknown) as BufferSource
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptLocalData(ciphertext: string, secretKey: string): Promise<string> {
  const decoded = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = decoded.slice(0, 12);
  const data = decoded.slice(12);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    (data as unknown) as BufferSource
  );

  return new TextDecoder().decode(decrypted);
}

// Local storage helper exports for frontend assessment tracking
export function saveEncryptedAssessment(data: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem("mizan_encrypted_vault", data);
  }
}

export function loadDecryptedAssessment(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem("mizan_encrypted_vault");
  }
  return null;
}

// Plural alias exported to satisfy page.tsx import
export function loadDecryptedAssessments(): string | null {
  return loadDecryptedAssessment();
}

export function hasLocalRecords(): boolean {
  if (typeof window !== 'undefined') {
    return !!localStorage.getItem("mizan_encrypted_vault");
  }
  return false;
}

export function wipeLocalVault(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem("mizan_encrypted_vault");
  }
}
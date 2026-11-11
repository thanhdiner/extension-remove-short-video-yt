// Frozen compatibility reference from the user-provided Quick 2FA implementation.
const EXPORT_VERSION = 1;
async function encryptExport(payload, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    app: "Quick 2FA",
    version: EXPORT_VERSION,
    encrypted: true,
    kdf: "PBKDF2",
    iterations: 210000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher))
  };
}

async function decryptExport(payload, passphrase) {
  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const cipher = base64ToBytes(payload.data);
    const key = await deriveAesKey(passphrase, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error("Wrong password or invalid import file");
  }
}

async function deriveAesKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}


export { encryptExport, decryptExport };

const ENCRYPTION_VERSION = "v1";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string, expectedBytes?: number): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Connector encryption key must be hexadecimal.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new Error(`Connector encryption key must be ${expectedBytes} bytes.`);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encryptionKey(keyHex: string, usage: KeyUsage): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    arrayBuffer(hexToBytes(keyHex, 32)),
    { name: "AES-GCM" },
    false,
    [usage],
  );
}

export async function encryptConnectorSecret(
  secret: string,
  keyHex: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(keyHex, "encrypt"),
    new TextEncoder().encode(secret),
  );
  return [
    ENCRYPTION_VERSION,
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  ].join(".");
}

export async function decryptConnectorSecret(
  encrypted: string,
  keyHex: string,
): Promise<string> {
  const [version, encodedIv, encodedCiphertext, extra] = encrypted.split(".");
  if (version !== ENCRYPTION_VERSION || !encodedIv || !encodedCiphertext || extra) {
    throw new Error("Connector secret ciphertext is invalid.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: arrayBuffer(base64ToBytes(encodedIv)) },
    await encryptionKey(keyHex, "decrypt"),
    arrayBuffer(base64ToBytes(encodedCiphertext)),
  );
  return new TextDecoder().decode(plaintext);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

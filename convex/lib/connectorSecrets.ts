const ENCRYPTION_VERSION = "v1";
const MAX_PREVIOUS_KEYS = 3;
const KEY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

export type ConnectorSecretKeyring = {
  activeKeyId: string;
  keys: ReadonlyMap<string, string>;
};

type ConnectorSecretEnvironment = {
  CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID?: string;
  CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY?: string;
  CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS?: string;
};

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

function normalizedKeyId(value: string | undefined): string {
  const keyId = value?.trim() ?? "";
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error("Connector encryption key ID is invalid.");
  }
  return keyId;
}

function normalizedKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Connector encryption key must be a string.");
  }
  const key = value.trim().toLowerCase();
  hexToBytes(key, 32);
  return key;
}

function previousKeys(value: string | undefined): Array<[string, string]> {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Previous connector encryption keys must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Previous connector encryption keys must be a JSON object.");
  }
  const entries = Object.entries(parsed);
  if (entries.length > MAX_PREVIOUS_KEYS) {
    throw new Error(`At most ${MAX_PREVIOUS_KEYS} previous connector encryption keys are allowed.`);
  }
  return entries.map(([keyId, key]) => [normalizedKeyId(keyId), normalizedKey(key)]);
}

export function connectorSecretKeyring(
  environment: ConnectorSecretEnvironment,
): ConnectorSecretKeyring {
  const activeKeyId = normalizedKeyId(
    environment.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID,
  );
  const activeKey = normalizedKey(
    environment.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY,
  );
  const keys = new Map<string, string>([[activeKeyId, activeKey]]);
  for (const [keyId, key] of previousKeys(
    environment.CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS,
  )) {
    if (keys.has(keyId)) {
      throw new Error("Connector encryption key IDs must be unique.");
    }
    keys.set(keyId, key);
  }
  return { activeKeyId, keys };
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
  keyring: ConnectorSecretKeyring,
): Promise<string> {
  const keyHex = keyring.keys.get(keyring.activeKeyId);
  if (!keyHex) throw new Error("Active connector encryption key is unavailable.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(keyHex, "encrypt"),
    new TextEncoder().encode(secret),
  );
  return [
    ENCRYPTION_VERSION,
    keyring.activeKeyId,
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  ].join(".");
}

export async function decryptConnectorSecret(
  encrypted: string,
  keyring: ConnectorSecretKeyring,
): Promise<{ secret: string; keyId: string }> {
  const [version, keyId, encodedIv, encodedCiphertext, extra] = encrypted.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !keyId ||
    !KEY_ID_PATTERN.test(keyId) ||
    !encodedIv ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error("Connector secret ciphertext is invalid.");
  }
  const keyHex = keyring.keys.get(keyId);
  if (!keyHex) throw new Error("Connector secret encryption key is unavailable.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: arrayBuffer(base64ToBytes(encodedIv)) },
    await encryptionKey(keyHex, "decrypt"),
    arrayBuffer(base64ToBytes(encodedCiphertext)),
  );
  return { secret: new TextDecoder().decode(plaintext), keyId };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

// Adapted from the user-owned Quick 2FA source in Extension/Authen.
import { base32ToBytes, bytesToBase32, bytesToBase64, base64ToBytes, normalizeAlgorithm, normalizeAccount } from './auth-core.mjs';
function createGoogleAuthenticatorMigrationUri(rows, batch) {
  if (!rows.length || rows.some(account => account.period !== 30)) throw new Error('authQrPeriodError');
  const payload = encodeMigrationPayload(rows, batch);
  return `otpauth-migration://offline?data=${encodeURIComponent(bytesToBase64(payload))}`;
}

function encodeMigrationPayload(rows, batch) {
  const parts = [];
  for (const account of rows) {
    parts.push(protoFieldBytes(1, encodeMigrationOtpParameter(account)));
  }
  parts.push(protoFieldVarint(2, 2));
  parts.push(protoFieldVarint(3, batch.batchSize));
  parts.push(protoFieldVarint(4, batch.batchIndex));
  parts.push(protoFieldVarint(5, batch.batchId));
  return concatBytes(parts);
}

function encodeMigrationOtpParameter(account) {
  return concatBytes([
    protoFieldBytes(1, base32ToBytes(account.secret)),
    protoFieldString(2, account.label || "2FA account"),
    protoFieldString(3, account.issuer || ""),
    protoFieldVarint(4, migrationAlgorithmValue(account.algorithm)),
    protoFieldVarint(5, account.digits === 8 ? 2 : 1),
    protoFieldVarint(6, 2)
  ]);
}

function migrationAlgorithmValue(value) {
  const algorithm = normalizeAlgorithm(value);
  if (algorithm === "SHA-256") return 2;
  if (algorithm === "SHA-512") return 3;
  return 1;
}

function protoFieldVarint(field, value) {
  return concatBytes([encodeVarint((field << 3) | 0), encodeVarint(value)]);
}

function protoFieldBytes(field, bytes) {
  return concatBytes([encodeVarint((field << 3) | 2), encodeVarint(bytes.length), bytes]);
}

function protoFieldString(field, value) {
  return protoFieldBytes(field, new TextEncoder().encode(value));
}

function encodeVarint(value) {
  const bytes = [];
  let number = Number(value);
  do {
    let byte = number & 0x7f;
    number = Math.floor(number / 128);
    if (number > 0) byte |= 0x80;
    bytes.push(byte);
  } while (number > 0);
  return new Uint8Array(bytes);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function parseMigrationPayload(bytes) {
  const reader = createProtoReader(bytes);
  const payload = { otpParameters: [] };

  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >> 3;
    const wire = tag & 7;

    if (field === 1 && wire === 2) {
      payload.otpParameters.push(parseOtpMigrationParameter(reader.bytes()));
    } else if (field === 2 && wire === 0) {
      payload.version = reader.varint();
    } else if (field === 3 && wire === 0) {
      payload.batchSize = reader.varint();
    } else if (field === 4 && wire === 0) {
      payload.batchIndex = reader.varint();
    } else if (field === 5 && wire === 0) {
      payload.batchId = reader.varint();
    } else {
      reader.skip(wire);
    }
  }

  return payload;
}

function parseOtpMigrationParameter(bytes) {
  const reader = createProtoReader(bytes);
  const item = {};

  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >> 3;
    const wire = tag & 7;

    if (field === 1 && wire === 2) item.secret = reader.bytes();
    else if (field === 2 && wire === 2) item.name = reader.string();
    else if (field === 3 && wire === 2) item.issuer = reader.string();
    else if (field === 4 && wire === 0) item.algorithm = reader.varint();
    else if (field === 5 && wire === 0) item.digits = reader.varint();
    else if (field === 6 && wire === 0) item.type = reader.varint();
    else reader.skip(wire);
  }

  return item;
}

function createProtoReader(bytes) {
  let offset = 0;
  return {
    done: () => offset >= bytes.length,
    varint() {
      let result = 0;
      let shift = 0;
      while (offset < bytes.length && shift < 53) {
        const byte = bytes[offset++];
        result += (byte & 0x7f) * 2 ** shift;
        if (!Number.isSafeInteger(result)) throw new Error('authQrError');
        if ((byte & 0x80) === 0) return result;
        shift += 7;
      }
      throw new Error('authQrError');
    },
    bytes() {
      const length = this.varint();
      const end = offset + length;
      if (end > bytes.length) throw new Error("Corrupted QR data");
      const value = bytes.slice(offset, end);
      offset = end;
      return value;
    },
    string() {
      return new TextDecoder().decode(this.bytes());
    },
    skip(wire) {
      if (wire === 0) {
        this.varint();
      } else if (wire === 2) {
        this.bytes();
      } else if (wire === 5) {
        offset += 4;
      } else if (wire === 1) {
        offset += 8;
      } else {
        throw new Error("Unsupported QR format");
      }
      if (offset > bytes.length) throw new Error("Corrupted QR data");
    }
  };
}

function migrationAlgorithmName(value) {
  if (value === 2) return "SHA-256";
  if (value === 3) return "SHA-512";
  if (value === 1 || value === undefined || value === 0) return 'SHA-1';
  throw new Error('authAlgorithmError');
}

export function parseMigrationUri(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'otpauth-migration:' || url.hostname !== 'offline') throw new Error();
    const encoded = (url.searchParams.get('data') || '').replace(/-/g, '+').replace(/_/g, '/');
    const bytes = base64ToBytes(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error();
    const payload = parseMigrationPayload(bytes);
    if (!payload.otpParameters.length || payload.otpParameters.length > 1000) throw new Error();
    const accounts = payload.otpParameters.map(item => {
      if (item.type !== 2) throw new Error('authTotpOnly');
      if (item.digits !== 1 && item.digits !== 2) throw new Error('authParamsError');
      return normalizeAccount({ label: item.name || '2FA', issuer: item.issuer || '', secret: bytesToBase32(item.secret || []), digits: item.digits === 2 ? 8 : 6, period: 30, algorithm: migrationAlgorithmName(item.algorithm) });
    });
    return { accounts, batch: { size: payload.batchSize || 1, index: payload.batchIndex || 0, id: payload.batchId } };
  } catch (error) { throw new Error(/^auth/.test(error.message) ? error.message : 'authQrError'); }
}


export { createGoogleAuthenticatorMigrationUri, parseMigrationPayload };

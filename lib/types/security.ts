export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject { [k: string]: JsonValue; }
export type JsonArray = JsonValue[];

// Encryption structures
export interface CipherText {
  iv: string;   // base64
  tag: string;  // base64
  payload: string; // base64
}

export interface EncryptOptions {
  aad?: string;           // additional authenticated data
  encoding?: BufferEncoding; // default "utf8"
}

export interface DecryptOptions extends EncryptOptions {}

export type EncryptInput = string | Buffer | JsonObject | JsonArray;

// Redaction
export interface RedactionOptions {
  mask?: string;                  // default "********"
  keyPatterns?: RegExp[];         // keys to redact
  maxDepth?: number;              // default 6
  maxStringUnmaskedPrefix?: number; // default 0 (fully masked)
}

export type Redacted<T> = T extends string ? string : T extends JsonObject ? JsonObject : JsonValue;
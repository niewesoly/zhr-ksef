import { hostname } from "node:os";
import { pino } from "pino";
import { config } from "../config.js";

// Wildcard paths — pino walks nested objects and censors any matching key,
// regardless of nesting depth. Covers the plan-mandated secrets plus their
// `_enc` envelope-encrypted variants.
const redactPaths = [
  "*.cert_pem",
  "*.key_pem",
  "*.key_passphrase",
  "*.api_key",
  "*.dek_enc",
  "*.cert_pem_enc",
  "*.key_pem_enc",
  "*.key_passphrase_enc",
];

interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

// Drizzle's `DrizzleQueryError.message` embeds the full SQL + params, and
// the default pino err serializer dumps it verbatim. We replace that one
// frame with a generic string and then recurse into `.cause`, where the
// real driver error lives.
function serializeError(err: unknown, depth = 0): SerializedError | undefined {
  if (!(err instanceof Error) || depth > 5) return undefined;
  const message = err.message.startsWith("Failed query:")
    ? "database query failed"
    : err.message;
  const cause = (err as { cause?: unknown }).cause;
  return {
    type: err.name,
    message,
    stack: err.stack,
    cause: serializeError(cause, depth + 1),
  };
}

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: { paths: redactPaths, censor: "[redacted]" },
  base: { service: "zhr-ksef", pid: process.pid, hostname: hostname() },
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    err: (err) => serializeError(err) ?? err,
  },
  transport: config.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      },
});

export type Logger = typeof logger;

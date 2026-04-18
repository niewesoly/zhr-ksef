import {
  decryptFieldAsString,
  unwrapDek,
} from "../lib/encryption.js";
import type { Tenant } from "../db/schema.js";
import { ksefBaseUrl } from "./urls.js";
import type { KsefCredentials } from "./auth.js";

export class MissingKsefCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingKsefCredentialsError";
  }
}

/** Loads a tenant's stored cert + key into in-memory PEM strings ready
 *  for the KSeF auth flow. Throws `MissingKsefCredentialsError` when
 *  cert/key have not been uploaded yet. */
export function loadTenantKsefCredentials(tenant: Tenant): KsefCredentials {
  if (!tenant.certPemEnc || !tenant.keyPemEnc) {
    throw new MissingKsefCredentialsError(
      "Brak certyfikatu KSeF dla tenanta — wgraj cert i klucz prywatny przez PATCH /tenants/:id.",
    );
  }

  const dek = unwrapDek(tenant.dekEnc, tenant.id);
  const certPem = decryptFieldAsString(tenant.certPemEnc, dek, tenant.id, "cert_pem");
  const privateKeyPem = decryptFieldAsString(tenant.keyPemEnc, dek, tenant.id, "key_pem");
  const passphrase = tenant.keyPassphraseEnc
    ? decryptFieldAsString(tenant.keyPassphraseEnc, dek, tenant.id, "key_passphrase")
    : undefined;

  return {
    apiUrl: ksefBaseUrl(tenant.apiUrl),
    nip: tenant.nip,
    certPem,
    privateKeyPem,
    passphrase,
  };
}

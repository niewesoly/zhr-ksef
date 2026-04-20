/**
 * XAdES-BASELINE-B (ENVELOPED) implementation for KSeF API V2.
 * Uses only node:crypto — no external XML or crypto libraries.
 *
 * Flow:
 *  1. Build AuthTokenRequest XML
 *  2. Compute reference digests (Inclusive C14N 1.0 + SHA-256)
 *  3. Sign SignedInfo (RSA-SHA256 or ECDSA-SHA256/384/512)
 *  4. Return complete XML document with embedded signature
 */

import crypto from "node:crypto";

// --- XMLDSig / XAdES constants ---

const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const XADES_SIGNED_PROPS_TYPE = "http://uri.etsi.org/01903#SignedProperties";
const KSEF_AUTH_NS = "http://ksef.mf.gov.pl/auth/token/2.0";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED_SIG = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SHA256_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
const RSA_SHA256_SIG = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const ECDSA_SHA256_SIG = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";
const ECDSA_SHA384_SIG = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384";
const ECDSA_SHA512_SIG = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512";

// --- Helpers ---

function sha256b64(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("base64");
}

function randomHex(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function pemToDerBase64(pem: string): string {
  return pem
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("-----"))
    .join("");
}

/** Pads or trims an ECDSA coord (r or s) to exactly coordLen bytes.
 *  DER INTEGER may have a leading 0x00 when MSB=1 — strip it.
 *  Shorter coords are left-padded with zeros. */
function padOrTrimCoord(buf: Buffer, coordLen: number): Buffer {
  if (buf.length === coordLen) return buf;
  if (buf.length > coordLen) {
    return buf.subarray(buf.length - coordLen);
  }
  const padded = Buffer.alloc(coordLen);
  buf.copy(padded, coordLen - buf.length);
  return padded;
}

/**
 * Converts an ECDSA signature from DER (ASN.1) to raw R||S (IEEE P1363),
 * as required by XAdES. Exported only for unit tests — treat as internal.
 * @internal
 */
export function ecDerToRawSignature(derSig: Buffer, coordLen: number): Buffer {
  // DER SEQUENCE { INTEGER r, INTEGER s } — validate tags AND lengths
  // against remaining buffer so a truncated blob throws rather than
  // silently returning a clamped subarray.
  let offset = 2; // skip SEQUENCE tag + length

  if (derSig[offset] !== 0x02) {
    throw new Error("Nieprawidłowy format podpisu DER ECDSA");
  }
  offset++;
  const rLen = derSig[offset]!;
  offset++;
  if (offset + rLen > derSig.length) {
    throw new Error("Nieprawidłowy format podpisu DER ECDSA");
  }
  const r = derSig.subarray(offset, offset + rLen);
  offset += rLen;

  if (derSig[offset] !== 0x02) {
    throw new Error("Nieprawidłowy format podpisu DER ECDSA");
  }
  offset++;
  const sLen = derSig[offset]!;
  offset++;
  if (offset + sLen > derSig.length) {
    throw new Error("Nieprawidłowy format podpisu DER ECDSA");
  }
  const s = derSig.subarray(offset, offset + sLen);

  const rPadded = padOrTrimCoord(r, coordLen);
  const sPadded = padOrTrimCoord(s, coordLen);
  return Buffer.concat([rPadded, sPadded]);
}

interface KeyAlgInfo {
  algorithmUri: string;
  hashAlg: string;
  sign: (data: string) => string;
  coordLen: number; // 0 dla RSA
}

function getKeyInfo(privateKeyPem: string, passphrase?: string): KeyAlgInfo {
  const keyInput: crypto.PrivateKeyInput = passphrase
    ? { key: privateKeyPem, format: "pem", passphrase }
    : { key: privateKeyPem, format: "pem" };

  const key = crypto.createPrivateKey(keyInput);
  const keyType = key.asymmetricKeyType;

  if (keyType === "rsa") {
    return {
      algorithmUri: RSA_SHA256_SIG,
      hashAlg: "SHA256",
      sign: (data) => {
        const signer = crypto.createSign("SHA256");
        signer.update(data, "utf8");
        return signer.sign({ key: privateKeyPem, passphrase }, "base64");
      },
      coordLen: 0,
    };
  }

  if (keyType === "ec") {
    const details = key.asymmetricKeyDetails as { namedCurve?: string };
    const curve = details.namedCurve ?? "";
    let algorithmUri: string;
    let hashAlg: string;
    let coordLen: number;

    if (curve === "prime256v1" || curve === "P-256") {
      algorithmUri = ECDSA_SHA256_SIG;
      hashAlg = "SHA256";
      coordLen = 32;
    } else if (curve === "secp384r1" || curve === "P-384") {
      algorithmUri = ECDSA_SHA384_SIG;
      hashAlg = "SHA384";
      coordLen = 48;
    } else {
      // P-521 or other
      algorithmUri = ECDSA_SHA512_SIG;
      hashAlg = "SHA512";
      coordLen = 66;
    }

    return {
      algorithmUri,
      hashAlg,
      sign: (data) => {
        const signer = crypto.createSign(hashAlg);
        signer.update(data, "utf8");
        const derSig = signer.sign({ key: privateKeyPem, passphrase });
        return ecDerToRawSignature(derSig, coordLen).toString("base64");
      },
      coordLen,
    };
  }

  throw new Error(`Nieobsługiwany typ klucza: ${keyType}`);
}

// --- Canonical XML forms (Inclusive C14N 1.0) ---

/**
 * Canonical AuthTokenRequest WITHOUT the Signature element.
 * Used to compute DigestValue for Reference URI="".
 * Only the default xmlns is in scope, so the result is identical to exc-c14n.
 */
function buildAuthRequestCanonical(challenge: string, nip: string): string {
  return (
    `<AuthTokenRequest xmlns="${KSEF_AUTH_NS}">` +
    `<Challenge>${escXml(challenge)}</Challenge>` +
    `<ContextIdentifier><Nip>${escXml(nip)}</Nip></ContextIdentifier>` +
    `<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>` +
    `</AuthTokenRequest>`
  );
}

/**
 * Canonical SignedProperties — Inclusive C14N 1.0.
 *
 * With inclusive C14N on a subtree, ALL namespaces inherited from ancestors
 * (even outside the node-set) appear on the subtree root.
 *
 * Ancestors of xades:SignedProperties in the document:
 *   AuthTokenRequest (xmlns="...ksef...")
 *   └ ds:Signature (xmlns:ds="...xmldsig...")
 *     └ ds:Object
 *       └ xades:QualifyingProperties (xmlns:xades="...xades...")
 *         └ xades:SignedProperties ← canonicalized subtree
 *
 * Therefore xades:SignedProperties renders 3 namespace declarations:
 *   xmlns="http://ksef.mf.gov.pl/auth/token/2.0"
 *   xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
 *   xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
 *
 * Child elements do NOT repeat declarations (already in scope from root).
 */
function buildSignedPropsCanonical(
  sigPropsId: string,
  signingTime: string,
  certDigest: string,
  issuerDN: string,
  serialNumber: string,
): string {
  return (
    `<xades:SignedProperties` +
    ` xmlns="${KSEF_AUTH_NS}"` +
    ` xmlns:ds="${DS_NS}"` +
    ` xmlns:xades="${XADES_NS}"` +
    ` Id="${escAttr(sigPropsId)}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${escXml(signingTime)}</xades:SigningTime>` +
    `<xades:SigningCertificate>` +
    `<xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escXml(issuerDN)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${escXml(serialNumber)}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert>` +
    `</xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`
  );
}

/**
 * Canonical SignedInfo — Inclusive C14N 1.0.
 *
 * Ancestors of ds:SignedInfo in the document:
 *   AuthTokenRequest (xmlns="...ksef...")
 *   └ ds:Signature (xmlns:ds="...xmldsig...")
 *     └ ds:SignedInfo ← canonicalized subtree
 *
 * Therefore ds:SignedInfo renders 2 namespace declarations:
 *   xmlns="http://ksef.mf.gov.pl/auth/token/2.0"
 *   xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
 *
 * Per the KSeF reference example:
 * - CanonicalizationMethod: Inclusive C14N 1.0
 * - Reference URI="": enveloped-signature transform only
 * - Reference #SignedProperties: no Transforms, Type attribute present
 */
function buildSignedInfoCanonical(
  sigPropsId: string,
  algorithmUri: string,
  documentDigest: string,
  signedPropsDigest: string,
): string {
  return (
    `<ds:SignedInfo xmlns="${KSEF_AUTH_NS}" xmlns:ds="${DS_NS}">` +
    `<ds:CanonicalizationMethod Algorithm="${escAttr(C14N)}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${escAttr(algorithmUri)}"></ds:SignatureMethod>` +
    `<ds:Reference URI="">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="${escAttr(ENVELOPED_SIG)}"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${documentDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="${escAttr(XADES_SIGNED_PROPS_TYPE)}" URI="#${escAttr(sigPropsId)}">` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`
  );
}

export interface XadesInput {
  challenge: string;
  nip: string;
  certPem: string;
  privateKeyPem: string;
  passphrase?: string;
}

/** Builds a signed XAdES-BASELINE-B (ENVELOPED) AuthTokenRequest document for POST /auth/xades-signature. */
export function buildXadesAuthDocument(input: XadesInput): string {
  const { challenge, nip, certPem, privateKeyPem, passphrase } = input;

  const sigId = `Signature-${randomHex()}`;
  const sigPropsId = `SignedProperties-${sigId}`;

  const certDerBase64 = pemToDerBase64(certPem);
  const certDerBuffer = Buffer.from(certDerBase64, "base64");
  const certDigest = sha256b64(certDerBuffer);

  const x509 = new crypto.X509Certificate(certPem);
  const issuerDN = formatDN(x509.issuer);
  const serialNumber = BigInt(`0x${x509.serialNumber}`).toString(10);

  // ISO 8601 signing time without milliseconds
  const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const keyAlgInfo = getKeyInfo(privateKeyPem, passphrase);

  // 1. Digest of the document (AuthTokenRequest without Signature) — Inclusive C14N
  const authRequestCanonical = buildAuthRequestCanonical(challenge, nip);
  const documentDigest = sha256b64(authRequestCanonical);

  // 2. Digest of SignedProperties — Inclusive C14N with inherited namespaces
  const signedPropsCanonical = buildSignedPropsCanonical(
    sigPropsId,
    signingTime,
    certDigest,
    issuerDN,
    serialNumber,
  );
  const signedPropsDigest = sha256b64(signedPropsCanonical);

  // 3. Build and sign SignedInfo — Inclusive C14N with inherited namespaces
  const signedInfoCanonical = buildSignedInfoCanonical(
    sigPropsId,
    keyAlgInfo.algorithmUri,
    documentDigest,
    signedPropsDigest,
  );
  const signatureValue = keyAlgInfo.sign(signedInfoCanonical);

  // 4. Assemble the final XML.
  //    SignedInfo in the document has no xmlns:ds (inherited from ds:Signature)
  //    and no default xmlns (inherited from AuthTokenRequest).
  //    The verifier applies Inclusive C14N and adds the inherited namespaces itself.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<AuthTokenRequest xmlns="${KSEF_AUTH_NS}">` +
    `<Challenge>${escXml(challenge)}</Challenge>` +
    `<ContextIdentifier><Nip>${escXml(nip)}</Nip></ContextIdentifier>` +
    `<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>` +
    `<ds:Signature xmlns:ds="${DS_NS}" Id="${escAttr(sigId)}">` +
    // SignedInfo without redundant xmlns — verifier reconstructs them from document context
    `<ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="${escAttr(C14N)}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${escAttr(keyAlgInfo.algorithmUri)}"></ds:SignatureMethod>` +
    `<ds:Reference URI="">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="${escAttr(ENVELOPED_SIG)}"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${documentDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="${escAttr(XADES_SIGNED_PROPS_TYPE)}" URI="#${escAttr(sigPropsId)}">` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>` +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo>` +
    `<ds:X509Data>` +
    `<ds:X509Certificate>${certDerBase64}</ds:X509Certificate>` +
    `</ds:X509Data>` +
    `</ds:KeyInfo>` +
    `<ds:Object>` +
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${escAttr(sigId)}">` +
    // SignedProperties without redundant xmlns — verifier reconstructs them from document context
    `<xades:SignedProperties Id="${escAttr(sigPropsId)}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${escXml(signingTime)}</xades:SigningTime>` +
    `<xades:SigningCertificate>` +
    `<xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${escAttr(SHA256_DIGEST)}"></ds:DigestMethod>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escXml(issuerDN)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${escXml(serialNumber)}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert>` +
    `</xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>` +
    `</AuthTokenRequest>`
  );
}

// --- Escape helpers ---

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Formats an X.509 certificate DN to RFC 2253 format (used in ds:X509IssuerName).
 * Node.js returns DN as "CN=...\nO=...\nC=..." — converts to "CN=..., O=..., C=...".
 */
function formatDN(dn: string): string {
  return dn
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse() // RFC 2253 reverses the order
    .join(", ");
}

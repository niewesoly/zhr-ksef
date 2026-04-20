import { z } from "zod";

// --- Auth V2 ---

export const ChallengeResponseSchema = z.object({
  challenge: z.string(),
  timestamp: z.string(),
  timestampMs: z.number(),
  clientIp: z.string().optional(),
});
export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;

export const KsefTokenResponseSchema = z.object({
  referenceNumber: z.string(),
  authenticationToken: z.object({
    token: z.string(),
    validUntil: z.string(),
  }),
});
export type KsefTokenResponse = z.infer<typeof KsefTokenResponseSchema>;

export const RedeemTokenResponseSchema = z.object({
  accessToken: z.object({
    token: z.string(),
    validUntil: z.string(),
  }),
  refreshToken: z.object({
    token: z.string(),
    validUntil: z.string(),
  }),
});
export type RedeemTokenResponse = z.infer<typeof RedeemTokenResponseSchema>;

// --- Public key certificates V2 ---

export const PublicKeyCertificateSchema = z.object({
  certificate: z.string(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  usage: z.array(z.string()),
});
export const PublicKeyCertificatesResponseSchema = z.array(PublicKeyCertificateSchema);
export type PublicKeyCertificate = z.infer<typeof PublicKeyCertificateSchema>;

export const AuthStatusResponseSchema = z.object({
  referenceNumber: z.string().optional(),
  status: z.object({
    code: z.number(),
    description: z.string().optional(),
  }),
});
export type AuthStatusResponse = z.infer<typeof AuthStatusResponseSchema>;

// --- Export V2 ---

export const ExportInitResponseSchema = z.object({
  referenceNumber: z.string(),
});

export const ExportPartSchema = z.object({
  url: z.string(),
  method: z.string().default("GET"),
});

export const ExportStatusSchema = z.object({
  referenceNumber: z.string().optional(),
  status: z.object({
    code: z.number(),
    description: z.string().optional(),
  }),
  package: z
    .object({
      invoiceCount: z.number().optional(),
      size: z.number().optional(),
      parts: z.array(ExportPartSchema).optional(),
      isTruncated: z.boolean().optional(),
      lastPermanentStorageDate: z.string().optional(),
      permanentStorageHwmDate: z.string().optional(),
    })
    .optional(),
});
export type ExportStatus = z.infer<typeof ExportStatusSchema>;
export type ExportPart = z.infer<typeof ExportPartSchema>;

// --- Invoice metadata from _metadata.json inside ZIP ---

export const InvoiceMetadataItemSchema = z.object({
  ksefReferenceNumber: z.string(),
  invoicingDate: z.string().optional(),
  subjectBy: z
    .object({
      issuedByIdentifier: z
        .object({
          type: z.string().optional(),
          identifier: z.string().optional(),
        })
        .optional(),
      issuedByName: z
        .object({
          type: z.string().optional(),
          tradeName: z.string().optional(),
          fullName: z.string().optional(),
          firstName: z.string().optional(),
          surname: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  subjectTo: z
    .object({
      issuedToIdentifier: z
        .object({
          type: z.string().optional(),
          identifier: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  net: z.number().optional(),
  vat: z.number().optional(),
  gross: z.number().optional(),
  currency: z.string().optional(),
  invoiceHash: z.string().optional(),
  fileName: z.string().optional(),
});
export type InvoiceMetadataItem = z.infer<typeof InvoiceMetadataItemSchema>;

export const ExportMetadataSchema = z.object({
  metadataList: z.array(InvoiceMetadataItemSchema),
});
export type ExportMetadata = z.infer<typeof ExportMetadataSchema>;

// Minimal top-level shape assertion for rows written by earlier parser
// versions. Fails loudly if required fields were never populated.
export const InvoiceFa3ShapeCheck = z
  .object({
    ksefNumber: z.string(),
    invoiceNumber: z.string().nullable(),
    issueDate: z.string().nullable(),
    seller: z.unknown(),
    buyer: z.unknown(),
    lineItems: z.array(z.unknown()),
  })
  .passthrough();

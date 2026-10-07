import { readFile } from 'node:fs/promises';
import { verifyMercadoPagoWebhookSignature } from './mercado-pago-orders.js';

// Passive comparison only: never authorizes a notification or changes payments.
export async function diagnoseMercadoPagoCandidateSignature(input: {
  mode: string | undefined;
  xSignature: string;
  xRequestId: string;
  dataId: string;
}, readCandidate = () => readFile(
  '/tmp/ramo-nessa-webhook-secret-candidate', 'utf8',
)): Promise<{
  candidateKeyLoaded: boolean;
  candidateSignatureValid: boolean;
  candidateLowerCaseSignatureValid: boolean;
}> {
  const result = {
    candidateKeyLoaded: false,
    candidateSignatureValid: false,
    candidateLowerCaseSignatureValid: false,
  };
  if (input.mode !== 'test') return result;
  try {
    const secret = (await readCandidate()).trim();
    if (!/^[A-Za-z0-9_-]{16,}$/.test(secret)) return result;
    result.candidateKeyLoaded = true;
    result.candidateSignatureValid = verifyMercadoPagoWebhookSignature({
      ...input, secret,
    });
    result.candidateLowerCaseSignatureValid = verifyMercadoPagoWebhookSignature({
      ...input, dataId: input.dataId.toLowerCase(), secret,
    });
  } catch {
    // Optional diagnostic must not interrupt normal webhook rejection.
  }
  return result;
}

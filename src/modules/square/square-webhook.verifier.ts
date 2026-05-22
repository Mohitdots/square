import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class SquareWebhookVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(params: { signatureHeader?: string; rawBody: Buffer }): { ok: boolean; error?: string } {
    const signatureKey = this.config.getOrThrow<string>('SQUARE_WEBHOOK_SIGNATURE_KEY');
    const notificationUrl = this.config.getOrThrow<string>('SQUARE_WEBHOOK_NOTIFICATION_URL');
    const signature = params.signatureHeader;
    if (!signature) return { ok: false, error: 'Missing x-square-signature header' };

    // Square spec: base64(HMAC-SHA1(signatureKey, notificationUrl + body))
    const bodyString = params.rawBody.toString('utf8');
    const computed = createHmac('sha1', signatureKey).update(notificationUrl + bodyString).digest('base64');
    const sigBuf = Buffer.from(signature);
    const cmpBuf = Buffer.from(computed);
    if (sigBuf.length !== cmpBuf.length) return { ok: false, error: 'Signature length mismatch' };
    const ok = timingSafeEqual(sigBuf, cmpBuf);
    return ok ? { ok } : { ok: false, error: 'Invalid signature' };
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

type LoginResponse = {
  access_token: string;
};

function decodeJwtExpMs(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

@Injectable()
export class ParcelhiveAuthService {
  private cachedToken: { token: string; expiresAtMs: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.cachedToken.expiresAtMs - 30_000) {
      return this.cachedToken.token;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.login().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async login(): Promise<string> {
    const baseUrl = this.config.getOrThrow<string>('PARCELHIVE_BASE_URL');
    const username = this.config.getOrThrow<string>('PARCELHIVE_USERNAME');
    const password = this.config.getOrThrow<string>('PARCELHIVE_PASSWORD');

    const started = Date.now();

    // IMPORTANT: form-urlencoded body
    const body = new URLSearchParams({
      username,
      password,
    }).toString();

    const res = await firstValueFrom(
      this.http.post<LoginResponse>(
        `${baseUrl.replace(/\/$/, '')}/token/`,
        body,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10_000,
        },
      ),
    );
    const token = res.data?.access_token;
    if (!token) {
      throw new Error('ParcelHive /token did not return access_token');
    }

    const expMs = decodeJwtExpMs(token);
    const fallbackExpiresAtMs = started + 15 * 60_000; // 15 min fallback

    this.cachedToken = {
      token,
      expiresAtMs: expMs ?? fallbackExpiresAtMs,
    };
    return token;
  }

}

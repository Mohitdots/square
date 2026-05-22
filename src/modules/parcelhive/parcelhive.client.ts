import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { withRetry } from '../../common/utils/retry';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiProvider } from '@prisma/client';
import { ParcelhiveAuthService } from './parcelhive-auth.service';

@Injectable()
export class ParcelhiveClient {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: ParcelhiveAuthService,
  ) {}

  private baseUrl(): string {
    return this.config.getOrThrow<string>('PARCELHIVE_BASE_URL').replace(/\/$/, '');
  }

  async post<TReq extends object, TRes = unknown>(params: {
    path: string;
    body: TReq;
    orderId?: string;
    timeoutMs?: number;
  }): Promise<AxiosResponse<TRes>> {
    const url = `${this.baseUrl()}${params.path.startsWith('/') ? '' : '/'}${params.path}`;

    return withRetry(
      async () => {
        const token = await this.auth.getAccessToken();
        const cfg: AxiosRequestConfig = {
          timeout: params.timeoutMs ?? 10_000,
          headers: { Authorization: `Bearer ${token}` },
        };

        const started = Date.now();
        try {
          const res = await firstValueFrom(this.http.post<TRes>(url, params.body, cfg));
          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.PARCELHIVE,
              method: 'POST',
              url,
              requestHeaders: cfg.headers as any,
              requestBody: params.body as any,
              responseStatus: res.status,
              responseHeaders: res.headers as any,
              responseBody: res.data as any,
              durationMs: Date.now() - started,
              orderId: params.orderId,
            },
          });
          return res;
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;
          const resData = err?.response?.data;
          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.PARCELHIVE,
              method: 'POST',
              url,
              requestHeaders: cfg.headers as any,
              requestBody: params.body as any,
              responseStatus: status,
              responseBody: resData as any,
              error: err?.message ?? 'Unknown error',
              durationMs: Date.now() - started,
              orderId: params.orderId,
            },
          });
          throw err;
        }
      },
      {
        retries: 3,
        baseDelayMs: 300,
        shouldRetry: (err: any) => {
          const status = err?.response?.status;
          // retry on network errors / 5xx / 429
          return !status || status >= 500 || status === 429;
        },
      },
    );
  }


  async get<TRes = unknown>(params: {
  path: string;
  orderId?: string;
  timeoutMs?: number;
}): Promise<AxiosResponse<TRes>> {
  const url = `${this.baseUrl()}${params.path.startsWith('/') ? '' : '/'}${params.path}`;

  return withRetry(
    async () => {
      const token = await this.auth.getAccessToken();
      const cfg: AxiosRequestConfig = {
        timeout: params.timeoutMs ?? 10_000,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      };

      const started = Date.now();
      try {
        const res = await firstValueFrom(this.http.get<TRes>(url, cfg));

        await this.prisma.apiLog.create({
          data: {
            provider: ApiProvider.PARCELHIVE,
            method: 'GET',
            url,
            requestHeaders: cfg.headers as any,
            responseStatus: res.status,
            responseHeaders: res.headers as any,
            responseBody: res.data as any,
            durationMs: Date.now() - started,
            orderId: params.orderId,
          },
        });

        return res;
      } catch (err: any) {
        const status = err?.response?.status as number | undefined;

        await this.prisma.apiLog.create({
          data: {
            provider: ApiProvider.PARCELHIVE,
            method: 'GET',
            url,
            requestHeaders: cfg.headers as any,
            responseStatus: status,
            responseBody: err?.response?.data as any,
            error: err?.message ?? 'Unknown error',
            durationMs: Date.now() - started,
            orderId: params.orderId,
          },
        });

        throw err;
      }
    },
    {
      retries: 3,
      baseDelayMs: 300,
      shouldRetry: (err: any) => {
        const status = err?.response?.status;
        return !status || status >= 500 || status === 429;
      },
    },
  );
}

}

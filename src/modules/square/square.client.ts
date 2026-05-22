import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiProvider } from '@prisma/client';
import { withRetry } from '../../common/utils/retry';

@Injectable()
export class SquareClient {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private baseUrl(): string {
    const env = this.config.get<string>('SQUARE_ENV', 'sandbox');
    return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareup.com';
  }

  async updateOrderCollectPin(params: {
    squareOrderId: string;
    collectPin: string;
    // version: number;
  }) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/${params.squareOrderId}/custom-attributes/collect_pin`;

    const body = {
      custom_attribute: {
        value: params.collectPin,
        // version: params.version,
      },
      idempotency_key: Math.random().toString(36).substring(2), // REQUIRED
    };

    console.log('[Square] Updating order collect_pin', { url, body });

    try {
      const res = await firstValueFrom(
        this.http.post(url, body, {
          // ✅ POST (NOT PUT)
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22',
          },
          timeout: 10_000,
        }),
      );

      console.log('[Square] collect_pin updated successfully:', res.data);
      return res.data;
    } catch (err: any) {
      console.error('[Square] collect_pin update FAILED');
      console.error('Status:', err?.response?.status);
      console.error('Response:', err?.response?.data);
      throw err;
    }
  }

  async createOrderCustomAttributeDefinition() {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/custom-attribute-definitions`;

    const body = {
      idempotency_key: `collect-pin-${Date.now()}`,
      custom_attribute_definition: {
        key: 'collect_pin',
        name: 'Collect PIN',
        description: 'Locker collection PIN for ParcelHive order',
        schema: {
          $ref: 'https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.String',
        },
        visibility: 'VISIBILITY_READ_WRITE_VALUES',
      },
    };

    try {
      const res = await firstValueFrom(
        this.http.post(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22',
          },
          timeout: 15_000,
        }),
      );

      console.log('[Square] Order custom attribute definition created');
      console.dir(res.data, { depth: null });

      return res.data;
    } catch (err: any) {
      console.error('[Square] Failed to create custom attribute definition');
      console.error('Status:', err?.response?.status);
      console.error('Response:', err?.response?.data);
      throw err;
    }
  }

  async updateOrderNote(params: { squareOrderId: string; note: string; currentVersion: number }) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/${params.squareOrderId}`;

    const body = {
      idempotency_key: `note-${Date.now()}`,
      order: {
        id: params.squareOrderId,
        version: params.currentVersion,
        note: params.note,
      },
    };

    // 🔵 PRINT REQUEST
    console.log('================ SQUARE REQUEST ================');
    console.log('URL:', url);
    console.log('METHOD: PUT');
    console.log('HEADERS:', {
      Authorization: `Bearer ${token?.substring(0, 10)}...`, // hide full token
      'Content-Type': 'application/json',
      'Square-Version': '2026-01-22',
    });
    console.dir(body, { depth: null });
    console.log('================================================');

    try {
      const res = await firstValueFrom(
        this.http.put(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22',
          },
          timeout: 15000,
        }),
      );

      // 🟢 PRINT RESPONSE
      console.log('================ SQUARE RESPONSE ================');
      console.log('Status:', res.status);
      console.log('Headers:', res.headers);
      console.dir(res.data, { depth: null });
      console.log('=================================================');

      return res.data;
    } catch (err: any) {
      // 🔴 PRINT ERROR RESPONSE
      console.log('================ SQUARE ERROR ===================');
      console.log('Status:', err?.response?.status);
      console.log('Headers:', err?.response?.headers);
      console.dir(err?.response?.data, { depth: null });
      console.log('=================================================');

      throw err;
    }
  }

  async updateLineItemNote(params: {
    squareOrderId: string;
    currentVersion: number;
    lineItemUid: string;
    note: string;
  }) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/${params.squareOrderId}`;

    const body = {
      idempotency_key: `locker-note-${Date.now()}`,
      order: {
        version: params.currentVersion,
        line_items: [
          {
            uid: params.lineItemUid,
            note: params.note,
          },
        ],
      },
    };

    console.log('====== SQUARE LINE ITEM NOTE UPDATE ======');
    console.dir(body, { depth: null });

    try {
      const res = await firstValueFrom(
        this.http.put(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22',
          },
          timeout: 15000,
        }),
      );

      console.log('✅ Line item note updated');
      console.dir(res.data, { depth: null });

      return res.data;
    } catch (err: any) {
      console.log('❌ Line item note update FAILED');
      console.log('Status:', err?.response?.status);
      console.dir(err?.response?.data, { depth: null });
      throw err;
    }
  }

  async updateOrderMetadata(params: {
    squareOrderId: string;
    version: number;
    metadata: Record<string, string>;
  }) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/${encodeURIComponent(params.squareOrderId)}`;

    const body = {
      idempotency_key: `locker-update-${Date.now()}`,
      order: {
        order_id: params.squareOrderId,
        version: params.version, // ⚠️ MUST be latest
        metadata: params.metadata,
      },
    };

    console.log('[Square] Update Order Metadata Payload:', body);

    return withRetry(
      async () => {
        const started = Date.now();

        try {
          const res = await firstValueFrom(
            this.http.put(url, body, {
              timeout: 10_000,
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Square-Version': '2026-01-22',
              },
            }),
          );

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'PUT',
              url,
              requestBody: body as any,
              responseStatus: res.status,
              responseHeaders: res.headers as any,
              responseBody: res.data as any,
              durationMs: Date.now() - started,
            },
          });

          return res.data;
        } catch (err: any) {
          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'PUT',
              url,
              requestBody: body as any,
              responseStatus: err?.response?.status,
              responseBody: err?.response?.data as any,
              error: err?.message,
              durationMs: Date.now() - started,
            },
          });

          throw err;
        }
      },
      {
        retries: 1,
        baseDelayMs: 300,
        shouldRetry: (err: any) => !err?.response?.status || err.response.status >= 500,
      },
    );
  }

  async getOrder(squareOrderId: string) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');

    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/orders/${encodeURIComponent(squareOrderId)}`;

    return withRetry(
      async () => {
        const started = Date.now();
        try {
          const res = await firstValueFrom(
            this.http.get(url, {
              timeout: 10_000,
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }),
          );

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: res.status,
              responseHeaders: res.headers as any,
              responseBody: res.data as any,
              durationMs: Date.now() - started,
            },
          });
          return res.data;
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: status,
              responseBody: err?.response?.data as any,
              error: err?.message ?? 'Unknown error',
              durationMs: Date.now() - started,
            },
          });

          throw err;
        }
      },
      {
        retries: 2,
        baseDelayMs: 300,
        shouldRetry: (err: any) => {
          const status = err?.response?.status;
          return !status || status >= 500 || status === 429;
        },
      },
    );
  }

  async getLocation(squareLocationId: string) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');

    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/locations/${encodeURIComponent(squareLocationId)}`;

    return withRetry(
      async () => {
        const started = Date.now();
        try {
          const res = await firstValueFrom(
            this.http.get(url, {
              timeout: 10_000,
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }),
          );

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: res.status,
              responseHeaders: res.headers as any,
              responseBody: res.data as any,
              durationMs: Date.now() - started,
            },
          });

          return res.data?.location ?? null;
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: status,
              responseBody: err?.response?.data as any,
              error: err?.message ?? 'Unknown error',
              durationMs: Date.now() - started,
            },
          });

          throw err;
        }
      },
      {
        retries: 2,
        baseDelayMs: 300,
        shouldRetry: (err: any) => {
          const status = err?.response?.status;
          return !status || status >= 500 || status === 429;
        },
      },
    );
  }

  async getCustomer(squareCustomerId: string) {
    const token = this.config.get<string>('SQUARE_ACCESS_TOKEN');

    if (!token) {
      throw new Error('SQUARE_ACCESS_TOKEN not configured');
    }

    const url = `${this.baseUrl()}/v2/customers/${encodeURIComponent(squareCustomerId)}`;

    return withRetry(
      async () => {
        const started = Date.now();
        try {
          const res = await firstValueFrom(
            this.http.get(url, {
              timeout: 10_000,
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }),
          );

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: res.status,
              responseHeaders: res.headers as any,
              responseBody: res.data as any,
              durationMs: Date.now() - started,
            },
          });
          console.log('[SquareClient] Fetched customer:');
          console.dir(res.data, { depth: null });
          return res.data?.customer ?? null;
        } catch (err: any) {
          const status = err?.response?.status as number | undefined;

          await this.prisma.apiLog.create({
            data: {
              provider: ApiProvider.SQUARE,
              method: 'GET',
              url,
              responseStatus: status,
              responseBody: err?.response?.data as any,
              error: err?.message ?? 'Unknown error',
              durationMs: Date.now() - started,
            },
          });

          throw err;
        }
      },
      {
        retries: 2,
        baseDelayMs: 300,
        shouldRetry: (err: any) => {
          const status = err?.response?.status;
          return !status || status >= 500 || status === 429;
        },
      },
    );
  }
}

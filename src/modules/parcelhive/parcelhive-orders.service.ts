import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParcelhiveClient } from './parcelhive.client';
import {
  CreateParcelHiveOrderRequest,
  CreateParcelHiveOrderResponse,
} from './dto/create-parcelhive-order.dto';

@Injectable()
export class ParcelhiveOrdersService {
  constructor(
    private readonly client: ParcelhiveClient,
    private readonly config: ConfigService,
  ) {}

  async createOrder(params: {
    orderId: string; // internal UUID for logging
    integrationNumber: string;
    // clientUid: string;
    locationUid: string;
    // depositPin: string;
    // collectPin: string;
    // servicePin: string;
    boxSize: 'small' | 'medium' | 'large' | 'extra-large';
    boxTemperature: 'ambient' | 'hot' ;
    // startsAt: Date;
    // endsAt: Date;
    recipientPhone?: string;
    recipientEmail?: string;
  }) {
    const webhookUrl = this.publicWebhookUrl('/webhook/parcelhive');

    const body: CreateParcelHiveOrderRequest = {
      integration_number: params.integrationNumber,
      // client_uid: params.clientUid,
      location_uid: params.locationUid,
      // deposit_pin: params.depositPin,
      // collect_pin: params.collectPin,
      
      // service_pin: params.servicePin,
      box_size: params.boxSize,
      box_temperature: params.boxTemperature,
      // starts_at: params.startsAt.toISOString(),
      // ends_at: params.endsAt.toISOString(),
      recipient_phone: params.recipientPhone,
      recipient_email: params.recipientEmail,
      webhook_url: webhookUrl,
    };

    console.log('[ParcelHive] CREATE ORDER REQUEST');
    console.dir(
      {
        body,
      },
      { depth: null },
    );

    const res = await this.client.post<CreateParcelHiveOrderRequest, CreateParcelHiveOrderResponse>(
      {
        path: '/order/create',
        body,
        orderId: params.orderId,
      },
    );


    console.log('[ParcelHive] CREATE ORDER RESPONSE');
    console.dir(res?.data, { depth: null });
    
    return res.data;
  }

  private publicWebhookUrl(path: string) {
    // If you deploy behind a gateway, set this to your public base URL and keep paths stable.
    const base = this.config.get<string>('PUBLIC_BASE_URL');
    if (!base) return path; // fallback; but recommended to set PUBLIC_BASE_URL
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  async getAvailableLockers() {
    const res = await this.client.get<any[]>({
      path: '/locker/all',
    });

    console.log('[ParcelHive] Total lockers available:', res.data?.length);

    return res.data ?? [];
  }

  async pickAvailableLocker() {

    const lockers = await this.getAvailableLockers();

    if (!lockers || lockers.length === 0) {
      console.log('[ParcelHive] No lockers found');
      return null;
    }

    for (const locker of lockers) {

      console.log(
        '[ParcelHive] locker',locker,
      );

      const boxes = await this.getLockerBoxes(locker.locker_external_id);   
   
      const hasFreeBox = boxes.some( (box) => box.box_status === 'free');

      if (hasFreeBox) {
        console.log(
          '[ParcelHive] ✅ Selected locker: ',hasFreeBox,
        );
        return locker;
      }
    }

    console.log('[ParcelHive] ❌ No lockers with free boxes found');
    return null;
  }

  async getLockerBoxes(lockerExternalId: string) {

    try {
       const res = await this.client.get<any[]>({
      path: `/locker/${lockerExternalId}/boxes`,
    });

    console.log(`[ParcelHive] Locker ${lockerExternalId} has ${res.data?.length} boxes`);

    return res.data ?? [];
    } catch (error) {
      console.log('[ParcelHive] Error fetching locker boxes:', error);
      return [];
    }
  }

  async deleteOrder(integrationNumber: string) {
  console.log(
    '[ParcelHive] Deleting / Cancelling order with integrationNumber:',
    integrationNumber,
  );

  try {
    const res = await this.client.post<any>({
      path: '/order/cancel', // ParcelHive cancel endpoint
      body: {
        integration_number: integrationNumber,
      },
    });

    console.log(
      '[ParcelHive] Order cancelled successfully:',
      res?.data,
    );

    return res?.data ?? null;
  } catch (error: any) {
    console.error(
      '[ParcelHive] Error cancelling order:',
      integrationNumber,
    );

    if (error?.response) {
      console.error('[ParcelHive] Status:', error.response.status);
      console.error('[ParcelHive] Response:', error.response.data);
    } else {
      console.error('[ParcelHive] Error:', error?.message ?? error);
    }

    return null;
  }
}


}

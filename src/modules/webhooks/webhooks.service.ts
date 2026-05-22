import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ParcelhiveOrdersService } from '../parcelhive/parcelhive-orders.service';
import { SquareWebhookVerifier } from '../square/square-webhook.verifier';
import { SquareClient } from '../square/square.client';
import { WebhookProvider } from '@prisma/client';
import { addMinutes } from '../../common/utils/time';
import { EmailService } from '../mail/mail.service';
import { SystemService } from '../system/system.service';

function safeJsonParse(input: any): any {
  // ✅ already object hai → return as-is
  if (typeof input === 'object' && !Buffer.isBuffer(input)) {
    return input;
  }

  try {
    const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);

    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ JSON parse failed');
    console.error('INPUT:', input);
    console.error('ERROR:', e);
    return null;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDisplayDate(iso?: string): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const datePart = date
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .replace(/ (\d{4})$/, ', $1');

  const timePart = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${datePart} ${timePart}`;
}

function toTitleCase(value?: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizePhoneHref(value?: string | null): string {
  return String(value ?? '').replace(/[^\d+]/g, '');
}

function formatSquareAddress(address?: any): string {
  if (!address) {
    return '';
  }

  return [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.administrative_district_level_1,
    address.postal_code,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

function buildEmailPayloadFromSquareOrder(params: {
  fullOrder: any;
  collectPin?: string | null;
  storeName: string;
  logoUrl: string;
  pickupAddress: string;
  pickupPhone: string;
  mapLat: string;
  mapLng: string;
  payment_time: string;
  source_type: string;
  receipt_number: string;
  payment?: any;
}) {
  const {
    fullOrder,
    collectPin,
    storeName,
    logoUrl,
    pickupAddress,
    pickupPhone,
    mapLat,
    mapLng,
    payment_time,
    source_type,
    receipt_number,
    payment,
  } = params;

  // ---------- helpers ----------
  const money = (amount?: number) => `£${((amount ?? 0) / 100).toFixed(2)}`;

  // ---------- pickup / customer ----------
  const pickup = fullOrder.fulfillments?.[0]?.pickup_details;
  const customerPhone = pickup?.recipient?.phone_number ?? '';

  const customerNameRaw =
    pickup?.recipient?.display_name ||
    `${pickup?.recipient?.address?.first_name ?? ''} ${
      pickup?.recipient?.address?.last_name ?? ''
    }`.trim() ||
    'Customer';

  const customerEmail = pickup?.recipient?.email_address ?? '';
  const customerName = escapeHtml(customerNameRaw);
  const customerEmailText = escapeHtml(customerEmail);

  const totalDiscountCents =
    fullOrder?.total_discount_money?.amount ??
    (fullOrder?.discounts ?? []).reduce(
      (sum: number, discount: any) => sum + (discount?.applied_money?.amount ?? 0),
      0,
    );
  const totalCents = fullOrder?.total_money?.amount ?? 0;
  const taxCents = fullOrder?.total_tax_money?.amount ?? 0;
  const subtotalCents = Math.max(totalCents + totalDiscountCents - taxCents, 0);

  // ---------- items html ----------
  const itemsHtml =
    (fullOrder.line_items ?? [])
      .map((item: any) => {
        const qty = Number(item.quantity ?? 1);
        const amount =
          item.total_money?.amount ??
          item.variation_total_price_money?.amount ??
          item.base_price_money?.amount ??
          item.gross_sales_money?.amount ??
          0;

        const detailLines = [
          ...(item.variation_name && !['Regular', 'Default'].includes(item.variation_name)
            ? [item.variation_name]
            : []),
          ...(item.modifiers ?? []).map((modifier: any) => {
            const modifierAmount =
              modifier?.total_price_money?.amount ?? modifier?.base_price_money?.amount ?? 0;
            const modifierPrice = modifierAmount > 0 ? ` (${money(modifierAmount)})` : '';
            return `${modifier?.name ?? ''}${modifierPrice}`;
          }),
        ]
          .filter(Boolean)
          .map((line) => `<span style="display:block;color:#546476;">${escapeHtml(line)}</span>`)
          .join('');

        return `
          <tr>
            <td style="padding:7px 0;vertical-align:top;">
              ${escapeHtml(item.name ?? 'Item')}${qty > 1 ? ` x ${qty}` : ''}
              ${detailLines}
            </td>
            <td align="right" style="padding:7px 0;vertical-align:top;white-space:nowrap;">${money(amount)}</td>
          </tr>
        `;
      })
      .join('') ||
    `
      <tr>
        <td style="padding:7px 0;">Order items</td>
        <td align="right" style="padding:7px 0;white-space:nowrap;">${money(totalCents)}</td>
      </tr>
    `;

  /* ---------------- DISCOUNT / COUPON ---------------- */
  let couponName = '';
  let discountAmount = '£0.00';

  if (fullOrder?.discounts?.length) {
    couponName =
      fullOrder.discounts
        .map((discount: any) => discount?.name)
        .filter(Boolean)
        .join(', ') || 'Discount';
    discountAmount = money(totalDiscountCents);
  }

  // ---------- totals ----------
  const subtotal = money(subtotalCents);
  const tax = money(taxCents);
  const total = money(totalCents);

  const discountRowHtml =
    totalDiscountCents > 0
      ? `
        <tr>
          <td style="padding:7px 0;color:#1f8b4c;">${escapeHtml(couponName || 'Discount')}</td>
          <td align="right" style="padding:7px 0;color:#1f8b4c;white-space:nowrap;">-${discountAmount}</td>
        </tr>
      `
      : '';

  const paymentCardBrand = toTitleCase(payment?.card_details?.card?.card_brand);
  const paymentEntryMethod = toTitleCase(payment?.card_details?.entry_method);
  const paymentLast4 = payment?.card_details?.card?.last_4 ?? '';
  const paymentMethodBase = paymentCardBrand || toTitleCase(source_type) || 'Paid via Square';
  const paymentMethodLabel = [
    paymentMethodBase,
    paymentLast4 || '',
    paymentEntryMethod ? `(${paymentEntryMethod})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const paymentAuthCode =
    payment?.card_details?.auth_result_code ??
    payment?.authorization_code ??
    payment?.auth_code ??
    '';
  const paymentAuthRowHtml = paymentAuthCode
    ? `
      <tr>
        <td style="padding:5px 0;">&nbsp;</td>
        <td align="right" style="padding:5px 0;">Auth code: ${escapeHtml(paymentAuthCode)}</td>
      </tr>
    `
    : '';

  const pickupPhoneHref = normalizePhoneHref(pickupPhone);
  const mapUrl =
    mapLat && mapLng
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${mapLat},${mapLng}`,
        )}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupAddress)}`;

  const normalizedCollectPin = String(collectPin ?? '').trim();
  const collectPinBlock = normalizedCollectPin
    ? `
      <tr>
        <td align="center" style="padding:0 15px 20px;font-size:13px;color:#546476;border-bottom:1px dashed #e5e5e5;">
          Locker Pickup PIN
          <div style="margin-top:8px;font-size:24px;font-weight:700;letter-spacing:4px;color:#333333;">${escapeHtml(
            normalizedCollectPin,
          )}</div>
        </td>
      </tr>
    `
    : '';

  // ---------- FINAL RETURN (EXACT SHAPE) ----------
  return {
    to: customerEmail,
    orderId: fullOrder.id,
    referenceNumber: escapeHtml(fullOrder.reference_id ?? ''),

    storeName: escapeHtml(storeName),
    logoUrl,

    pickupTime: formatDisplayDate(pickup?.pickup_at) || 'To be confirmed',
    collectPin: collectPinBlock,

    pickupAddress: escapeHtml(pickupAddress),
    pickupPhone: escapeHtml(pickupPhone),
    pickupPhoneHref,
    mapLat,
    mapLng,
    mapUrl,

    couponName: escapeHtml(couponName),
    discountAmount,
    discountRowHtml,

    itemsHtml,
    subtotal,
    tax,
    total,

    customerName,
    customerEmail: customerEmailText,
    customerPhone: escapeHtml(customerPhone),
    customerEmailHref: customerEmail,
    paymentMethod: escapeHtml(paymentMethodLabel),
    payment_time: payment_time,
    paymentDisplayTime:
      formatDisplayDate(payment?.created_at ?? payment_time) || formatDisplayDate(payment_time),
    source_type: source_type,
    receipt_number: receipt_number,
    receiptDisplayNumber: receipt_number ? `#${escapeHtml(receipt_number)}` : '',
    paymentMethodLabel: escapeHtml(paymentMethodLabel),
    paymentCardBrand: paymentCardBrand || paymentMethodBase,
    paymentAuthCode: escapeHtml(paymentAuthCode),
    paymentAuthRowHtml,
  };
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly parcelhiveOrders: ParcelhiveOrdersService,
    private readonly squareVerifier: SquareWebhookVerifier,
    private readonly square: SquareClient,
    private readonly emailService: EmailService,
    private readonly systemService: SystemService,
  ) {}

  private async resolveEmailStoreContext(fullOrder: any) {
    const fallback = {
      storeName: this.config.get<string>('EMAIL_STORE_NAME') || 'Common Breads',
      logoUrl: this.config.get<string>('EMAIL_LOGO_URL') || 'https://yourcdn.com/logo.png',
      pickupAddress:
        this.config.get<string>('EMAIL_PICKUP_ADDRESS') ||
        '110 Buckingham Palace Road, London SW1W 9SA',
      pickupPhone: this.config.get<string>('EMAIL_PICKUP_PHONE') || '020 8017 3773',
      mapLat: this.config.get<string>('EMAIL_MAP_LAT') || '51.4949',
      mapLng: this.config.get<string>('EMAIL_MAP_LNG') || '-0.1427',
    };

    const locationId = fullOrder?.location_id;
    if (!locationId) {
      return fallback;
    }

    try {
      const location = await this.square.getLocation(locationId);
      if (!location) {
        return fallback;
      }

      const resolvedStoreName =
        String(location?.business_name ?? '').trim() ||
        String(location?.name ?? '').trim() ||
        fallback.storeName;
      const resolvedAddress = formatSquareAddress(location?.address) || fallback.pickupAddress;
      const resolvedPhone =
        String(
          location?.phone_number ??
            location?.business_phone_number ??
            location?.business_phone ??
            '',
        ).trim() || fallback.pickupPhone;
      const resolvedMapLat =
        String(location?.coordinates?.latitude ?? location?.latitude ?? '').trim() ||
        fallback.mapLat;
      const resolvedMapLng =
        String(location?.coordinates?.longitude ?? location?.longitude ?? '').trim() ||
        fallback.mapLng;
      const resolvedLogoUrl = String(location?.logo_url ?? '').trim() || fallback.logoUrl;

      return {
        storeName: resolvedStoreName,
        logoUrl: resolvedLogoUrl,
        pickupAddress: resolvedAddress,
        pickupPhone: resolvedPhone,
        mapLat: resolvedMapLat,
        mapLng: resolvedMapLng,
      };
    } catch (error: any) {
      console.warn(
        '[SquareWebhook] Failed to resolve location details, using fallback values:',
        error?.message ?? error,
      );
      return fallback;
    }
  }

  async handleSquareWebhook(params: {
    rawBody: Buffer;
    headers: Record<string, any>;
    signatureHeader?: string;
    path?: string;
  }) {
    // 1. Verify webhook signature
    const verification = this.squareVerifier.verify({
      signatureHeader: params.signatureHeader,
      rawBody: params.rawBody,
    });

    const parsed = safeJsonParse(params.rawBody);

    if (!verification.ok) {
      console.warn('Square webhook verification failed:', verification.error);
      return { ok: false, error: verification.error };
    }

    // 3. Extract Square Order ID
    const squareOrderId = parsed?.data?.object?.payment?.order_id;
    if (!squareOrderId) {
      return {
        ok: false,
        error: 'Square order id not found in webhook',
      };
    }

    // 4. Fetch full order from Square
    const data = await this.square.getOrder(squareOrderId);
    const fullOrder = data?.order;

    if (!fullOrder) {
      return {
        ok: false,
        error: 'Square order not found',
      };
    }

    const sourceName = fullOrder?.source?.name ?? null;

    const recipientEmail =
      fullOrder?.fulfillments?.[0]?.pickup_details?.recipient?.email_address ?? null;

    // IMPORTANT: Only process Square Online orders
    if (sourceName !== 'Square Online') {
      console.log('[SquareWebhook] Ignored source:', sourceName);
      return {
        ok: true,
        ignored: true,
        reason: `Source ${sourceName} not supported`,
      };
    }

    // 2. Create webhook log (always)
    const webhookLog = await this.prisma.webhookLog.create({
      data: {
        provider: WebhookProvider.SQUARE,
        path: params.path ?? '/webhook/square_sss',
        headers: params.headers as any,
        body: parsed as any,
        rawBody: params.rawBody.toString('utf8'),
        verified: verification.ok,
        verificationError: verification.error,
      },
    });

    // 5. Prepare order data
    const locationId = fullOrder.location_id;
    const storeContext = await this.resolveEmailStoreContext(fullOrder);
    // const recipientEmail = fullOrder?.fulfillments?.[0]?.pickup_details?.recipient?.email_address ?? null;
    const recipientPhone =
      fullOrder?.fulfillments?.[0]?.pickup_details?.recipient?.phone_number ?? null;

    const now = new Date();
    const startsAt = now;
    const endsAt = addMinutes(now, 60 * 24);

    // 6. Upsert internal order
    const order = await this.orders.upsertFromSquare({
      squareOrderId,
      integrationNumber: fullOrder.reference_id ?? squareOrderId,
      squareCustomerId: fullOrder.customer_id ?? null,
      squareLocationId: locationId,
      recipientEmail,
      recipientPhone,
      startsAt,
      endsAt,
      squareOrderPayload: fullOrder as any,
    });

    // link webhook log → order
    await this.prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { orderId: order.id },
    });

    try {
      // 7. Check ParcelHive API is enabled before proceeding
      const parcelhiveEnabled = await this.systemService.isParcelhiveEnabled();

      let collectPin = '';

      if (!parcelhiveEnabled) {
        // ParcelHive skipped — still send email but without a collect PIN
        console.log(
          '[SquareWebhook] ParcelHive disabled — skipping locker, sending email without PIN',
        );
        await this.orders.markFailed(order.id, 'ParcelHive API is disabled');
      } else {
        // 8. Pick available locker
        const locker = await this.parcelhiveOrders.pickAvailableLocker();

        if (!locker) {
          await this.orders.markFailed(order.id, 'No available locker found');
          return {
            ok: false,
            orderId: order.id,
            error: 'No available locker found',
          };
        }

        // 9. Create ParcelHive order
        const created = await this.parcelhiveOrders.createOrder({
          orderId: order.id,
          integrationNumber: fullOrder.reference_id,
          locationUid: locker.locker_external_id,
          boxSize: 'medium',
          boxTemperature: 'ambient',
          recipientEmail: order.recipientEmail ?? undefined,
          recipientPhone: order.recipientPhone ?? undefined,
        });

        collectPin = created?.collect_pin ?? '';

        await this.orders.markSentToParcelHive(
          order.id,
          created?.id ?? created?.order_uid,
          created?.collect_pin,
        );

        try {
          await this.square.updateOrderNote({
            squareOrderId: squareOrderId,
            note: `Locker Assigned | PIN: ${created?.collect_pin}`,
            currentVersion: fullOrder.version,
          });
        } catch (error) {
          console.error('Failed to update Square order note:', error);
        }
      }

      try {
        const emailPayload = buildEmailPayloadFromSquareOrder({
          fullOrder,
          collectPin,
          ...storeContext,
          payment_time: parsed?.data?.object?.payment?.created_at || '',
          source_type: parsed?.data?.object?.payment?.source_type || '',
          receipt_number: parsed?.data?.object?.payment?.receipt_number || '',
          payment: parsed?.data?.object?.payment,
        });

        if (emailPayload.to) {
          console.log(`[Email] Sending order confirmation → ${emailPayload.to}`);
          await this.emailService.sendOrderConfirmationEmail(emailPayload);
          console.log(`[Email] ✅ Order confirmation sent → ${emailPayload.to}`);
        } else {
          console.warn('[Email] ⚠️  Order confirmation skipped — recipient email missing');
        }

        console.log('[Email] Sending admin notification email…');
        await this.emailService.sendAdminOrderNotificationEmail(emailPayload);
        console.log('[Email] ✅ Admin notification sent');
      } catch (error) {
        console.error('[Email] ❌ Email sending failed:', error);
      }

      return {
        ok: true,
        orderId: order.id,
      };
    } catch (err: any) {
      console.error('[SquareWebhook] ParcelHive error:', err?.response?.data || err);

      try {
        await this.square.updateOrderNote({
          squareOrderId: squareOrderId,
          note: `Locker Assigned | error: ${err?.response?.data?.details || 'Unknown error'}`,
          currentVersion: fullOrder.version,
        });
      } catch (error) {
        console.error('Failed to update Square order note:', error);
      }

      return {
        ok: false,
        orderId: order.id,
        error: err?.response?.data ?? err?.message,
      };
    }
  }

  async testLocker() {
    const res = await this.square.getOrder('pJ73Wjs58tJTzYptGCVPDF8qPvTZY');
    const fullOrder = res?.order;

    console.dir(fullOrder, { depth: null });

    try {
      const squareOrderId = fullOrder?.id;
      const lineItemUid = fullOrder?.line_items?.[0]?.uid;

      // const result = await this.square.updateOrderNote({
      //   squareOrderId: squareOrderId,
      //   note: `Locker Assigned | PIN: ${Math.floor(1000 + Math.random() * 9000)}`,
      //   currentVersion: fullOrder.version,
      // });

      const result = await this.square.updateLineItemNote({
        squareOrderId: squareOrderId,
        currentVersion: fullOrder.version,
        lineItemUid: 'BvRc1nPyYbNnhKOq8XJRkC',
        note: `Locker Assigned | PIN: ${Math.floor(1000 + Math.random() * 9000)}`,
      });

      console.log('Square order note update result:', result);
    } catch (error) {
      console.error('Failed to update Square order note:', error);
    }

    // const locker = await this.parcelhiveOrders.pickAvailableLocker();
    // console.log('Picked locker:', locker);
  }

  async testOrder() {
    console.log('====== TEST ORDER START ======');

    console.log('[1] Calling Square getOrder');

    const res = await this.square.getOrder('pTgXux9jjJUZSy1oSnMixMmpUHPZY');

    const squareOrderId = 'pTgXux9jjJUZSy1oSnMixMmpUHPZY';
    const fullOrder = res?.order;
    console.dir(fullOrder, { depth: null });
    const locationId = fullOrder?.location_id;
    console.log('[testOrder] Location ID from order:', locationId);
    const storeContext = await this.resolveEmailStoreContext(fullOrder);
    console.log('[testOrder] Resolved store context:', storeContext);

    const recipientEmail =
      fullOrder?.fulfillments?.[0]?.pickup_details?.recipient?.email_address ?? null;
    console.log('Recipient email:', recipientEmail);

    const recipientPhone =
      fullOrder?.fulfillments?.[0]?.pickup_details?.recipient?.phone_number ?? null;

    const now = new Date();
    const startsAt = now;
    const endsAt = addMinutes(now, 60 * 24);

    // for testing email only:
    const emailPayload = buildEmailPayloadFromSquareOrder({
      fullOrder,
      collectPin: '1234',
      ...storeContext,
      payment_time: fullOrder?.data?.object?.payment?.created_at || undefined,
      source_type: fullOrder?.data?.object?.payment?.source_type || undefined,
      receipt_number: fullOrder?.data?.object?.payment?.receipt_number || undefined,
      payment: fullOrder?.data?.object?.payment,
    });

    console.log('====== EMAIL PAYLOAD ======');
    console.log('To (customer)  :', emailPayload.to);
    console.log('Customer name  :', emailPayload.customerName);
    console.log('Store name     :', emailPayload.storeName);
    console.log('Pickup address :', emailPayload.pickupAddress);
    console.log('Collect PIN    :', emailPayload.collectPin || '(empty)');
    console.log('Total          :', emailPayload.total);
    console.log('===========================');

    try {
      if (emailPayload.to) {
        console.log(`[TestEmail] Sending customer confirmation → ${emailPayload.to}`);
        await this.emailService.sendOrderConfirmationEmail(emailPayload);
        console.log(`[TestEmail] ✅ Customer confirmation sent → ${emailPayload.to}`);
      } else {
        console.warn('[TestEmail] ⚠️  Customer email skipped — recipient email missing');
      }
    } catch (err) {
      console.error('[TestEmail] ❌ Customer confirmation failed:', err);
    }

    try {
      console.log('[TestEmail] Sending admin notification…');
      await this.emailService.sendAdminOrderNotificationEmail(emailPayload);
      console.log('[TestEmail] ✅ Admin notification sent');
    } catch (err) {
      console.error('[TestEmail] ❌ Admin notification failed:', err);
    }

    console.log('====== TEST ORDER DONE ======');
    return { ok: true };

    try {
      const order = await this.orders.upsertFromSquare({
        squareOrderId,
        integrationNumber: squareOrderId,
        squareCustomerId: fullOrder?.customer_id || null,
        squareLocationId: locationId,
        recipientEmail,
        recipientPhone,
        startsAt,
        endsAt,
        squareOrderPayload: '',
      });

      const locker = await this.parcelhiveOrders.pickAvailableLocker();
      // console.log('[7] Picked locker id:', locker);
      const created = await this.parcelhiveOrders.createOrder({
        orderId: order.id,
        integrationNumber: Math.random().toString(), //fullOrder.reference_id,
        // clientUid: order.squareCustomerId ?? 'UNKNOWN_CUSTOMER',
        locationUid: locker.locker_external_id,
        boxSize: 'medium', // ✅ default for now
        boxTemperature: 'ambient',
        // startsAt,
        // endsAt,
        recipientEmail: order.recipientEmail ?? undefined,
        recipientPhone: order.recipientPhone ?? undefined,
      });

      console.log('[7 DONE] ParcelHive order created:', created);

      await this.orders.markSentToParcelHive(order.id, created?.id ?? created?.order_uid);

      const noteParts = [
        `Locker: ${created?.location_uid}`,
        created?.collect_pin ? `Collect PIN: ${created?.collect_pin}` : null,
        created?.box_size ? `Box Size: ${created?.box_size}` : null,
      ].filter(Boolean);

      const emailPayload = buildEmailPayloadFromSquareOrder({
        fullOrder,
        collectPin: '',
        ...storeContext,
        payment_time: fullOrder?.data?.object?.payment?.created_at || undefined,
        source_type: fullOrder?.data?.object?.payment?.source_type || undefined,
        receipt_number: fullOrder?.data?.object?.payment?.receipt_number || undefined,
        payment: fullOrder?.data?.object?.payment,
      });

      await this.emailService.sendOrderConfirmationEmail(emailPayload);
      await this.emailService.sendAdminOrderNotificationEmail(emailPayload);

      console.log('====== TEST ORDER SUCCESS ======');

      return { ok: true, orderId: order.id, parcelhive: created };
    } catch (err: any) {
      console.error('❌ TEST ORDER FAILED');
      console.error('Message:', err?.message);
      console.error('Code:', err?.code);
      console.error('Response:', err?.response?.data);

      throw err;
    }
  }

  // ParcelHive webhook handler
  async handleParcelHiveWebhook(params: { headers: Record<string, any>; body: any }) {
    // Optional shared secret check
    // const secret = this.config.get<string>('PARCELHIVE_WEBHOOK_SECRET');
    // if (secret) {
    //   const got = (params.headers['x-parcelhive-webhook-secret'] as string | undefined) ?? '';
    //   if (got !== secret) {
    //     await this.prisma.webhookLog.create({
    //       data: {
    //         provider: WebhookProvider.PARCELHIVE,
    //         path: '/webhook/parcelhive',
    //         headers: params.headers as any,
    //         body: params.body as any,
    //         verified: false,
    //         verificationError: 'Invalid PARCELHIVE_WEBHOOK_SECRET',
    //       },
    //     });
    //     return { ok: false, error: 'Unauthorized' };
    //   }
    // }

    const log = await this.prisma.webhookLog.create({
      data: {
        provider: WebhookProvider.PARCELHIVE,
        path: '/webhook/parcelhive',
        headers: params.headers as any,
        body: params.body as any,
        verified: true,
      },
    });

    console.log('[ParcelHive Webhook] Received payload:');
    console.dir(params.body, { depth: null });
    // Expect ParcelHive to include integration_number or order reference.
    const integrationNumber =
      params.body?.integration_number ??
      params.body?.integrationNumber ??
      params.body?.order?.integration_number;

    if (!integrationNumber) {
      return { ok: false, error: 'Missing integration_number', webhookLogId: log.id };
    }

    const order = await this.prisma.order.findUnique({ where: { integrationNumber } });
    if (!order) {
      return {
        ok: false,
        error: `Order not found for integration_number=${integrationNumber}`,
        webhookLogId: log.id,
      };
    }

    await this.prisma.webhookLog.update({ where: { id: log.id }, data: { orderId: order.id } });

    // Handle "lockers full" vs assigned.
    // Because ParcelHive webhook payload isn't fully specified, we support both:
    // - body.status === 'LOCKER_ASSIGNED'
    // - body.locker_assigned === true
    // - body.lockers_full === true
    const lockersFull = Boolean(params.body?.lockers_full ?? params.body?.lockersFull);
    if (lockersFull) {
      await this.orders.markStorePickup(order.id, 'ParcelHive reported lockers full');

      await this.square.updateOrderMetadata({
        squareOrderId: 'djDTGlL1Rx1Tf99MwMDn0lCrmkbZY',
        version: 35, // MUST MATCH latest order version
        metadata: {
          locker_id: 'LOCKER_1',
          status: 'LOCKER_ASSIGNED',
        },
      });
      return { ok: true, status: 'STORE_PICKUP', orderId: order.id };
    }

    const lockerUid = params.body?.locker_uid ?? params.body?.lockerUid ?? params.body?.locker?.uid;
    const lockerNumber =
      params.body?.locker_number ?? params.body?.lockerNumber ?? params.body?.locker?.number;
    const depositPin = params.body?.deposit_pin ?? params.body?.depositPin;
    const collectPin = params.body?.collect_pin ?? params.body?.collectPin;
    const qrCode = params.body?.qr_code ?? params.body?.qrCode ?? params.body?.qr;

    await this.orders.markLockerAssigned(order.id, {
      lockerUid,
      lockerNumber,
      depositPin,
      collectPin,
      qrCode,
    });

    const noteParts = [
      lockerNumber ? `Locker: ${lockerNumber}` : lockerUid ? `Locker UID: ${lockerUid}` : null,
      collectPin ? `Collect PIN: ${collectPin}` : null,
      qrCode ? `QR: ${qrCode}` : null,
    ].filter(Boolean);

    // await this.square.updateOrderMetadata({
    //   squareOrderId: 'djDTGlL1Rx1Tf99MwMDn0lCrmkbZY',
    //   version: 35, // MUST MATCH latest order version
    //   metadata: {
    //     locker_id: 'LOCKER_1',
    //     status: 'LOCKER_ASSIGNED',
    //   },
    // });

    return { ok: true, status: 'LOCKER_ASSIGNED', orderId: order.id };
  }
}

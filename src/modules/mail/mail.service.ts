import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { renderTemplate } from './../../utils/renderTemplate';

const TEMPLATE_IMAGE_PATH = path.join(process.cwd(), 'src/modules/mail/template/images');

const ORDER_CONFIRMATION_ATTACHMENTS = [
  { filename: 'CB-logo.png', cid: 'cb-logo' },
  { filename: 'globe-logo.png', cid: 'globe-logo' },
  { filename: 'instagram-logo.png', cid: 'instagram-logo' },
  { filename: 'map.jpg', cid: 'pickup-map' },
  { filename: 'order-status-btn.png', cid: 'order-status-btn' },
  { filename: 'square-logo.png', cid: 'square-logo' },
  { filename: 'visa.png', cid: 'visa-logo' },
] as const;

type OrderEmailData = {
  to: string;
  orderId: string;
  referenceNumber: string;
  storeName: string;
  logoUrl: string;
  pickupTime: string;
  collectPin: string;
  pickupAddress: string;
  pickupPhone: string;
  mapLat: string;
  mapLng: string;
  couponName: string;
  discountAmount: string;
  itemsHtml: string;
  subtotal: string;
  tax: string;
  total: string;
  customerName: string;
  customerEmail: string;
  customerEmailHref: string;
  customerPhone: string;
  source_type: string;
  payment_time: string;
  paymentDisplayTime: string;
  receipt_number: string;
  receiptDisplayNumber: string;
  pickupPhoneHref: string;
  mapUrl: string;
  discountRowHtml: string;
  paymentMethodLabel: string;
  paymentCardBrand: string;
  paymentAuthCode: string;
  paymentAuthRowHtml: string;
};

const ADMIN_NOTIFICATION_EMAIL = 'admin0050@yopmail.com';

export class EmailService {
  private transporter = nodemailer.createTransport({
    host: 'mail.24livehost.com', // or SES / Sendgrid
    port: 587,
    secure: false,
    auth: {
      user: 'parcelhive@24livehost.com',
      pass: 'w(b3LabBJCcK',
    },
  });

  private buildTemplateVars(data: OrderEmailData, isVisa: boolean) {
    const paymentIconHtml = isVisa
      ? '<img src="cid:visa-logo" width="37" height="22" alt="Visa" style="display:block;">'
      : '<img src="cid:square-logo" width="22" height="22" alt="Square" style="display:block;">';

    return {
      INSTAGRAM_URL: 'https://instagram.com/commonbreads',
      WEBSITE_URL: 'https://commonbreads.com',
      CB_LOGO_SRC: 'cid:cb-logo',
      GLOBE_LOGO_SRC: 'cid:globe-logo',
      INSTAGRAM_LOGO_SRC: 'cid:instagram-logo',
      MAP_IMAGE_SRC: 'cid:pickup-map',
      ORDER_STATUS_BUTTON_SRC: 'cid:order-status-btn',
      SQUARE_LOGO_SRC: 'cid:square-logo',
      PAYMENT_TIME: data.paymentDisplayTime || data.payment_time,
      ORDER_SHORT_CODE: data.receiptDisplayNumber,
      VAT_NUMBER: '413777095',
      LOGO_URL: data.logoUrl,
      referenceNumber: data.referenceNumber,
      STORE_NAME: data.storeName,
      PICKUP_TIME: data.pickupTime,
      COLLECT_PIN: data.collectPin,
      PICKUP_ADDRESS: data.pickupAddress,
      PICKUP_PHONE: data.pickupPhone,
      PICKUP_PHONE_HREF: data.pickupPhoneHref,
      MAP_LAT: data.mapLat,
      MAP_LNG: data.mapLng,
      MAP_URL: data.mapUrl,
      ORDER_ITEMS: data.itemsHtml,
      SUBTOTAL: data.subtotal,
      TAX: data.tax,
      TOTAL: data.total,
      FINAL_TOTAL: data.total,
      COUPON_CODE: data.couponName,
      DISCOUNT_AMOUNT: data.discountAmount,
      DISCOUNT_ROW: data.discountRowHtml,
      CUSTOMER_NAME: data.customerName,
      CUSTOMER_EMAIL: data.customerEmail,
      CUSTOMER_EMAIL_HREF: data.customerEmailHref,
      CUSTOMER_PHONE: data.customerPhone,
      PAYMENT_METHOD: data.source_type,
      PAYMENT_METHOD_LABEL: data.paymentMethodLabel,
      PAYMENT_ICON_HTML: paymentIconHtml,
      PAYMENT_AUTH_ROW: data.paymentAuthRowHtml,
      ORDER_ID: data.orderId,
      YEAR: new Date().getFullYear().toString(),
      ORDER_STATUS_URL: `https://commonbreads.square.site/s/order-confirmation/${data.orderId}/confirmation`,
    };
  }

  async sendOrderConfirmationEmail(data: OrderEmailData) {
    const isVisa =
      data.paymentCardBrand.toLowerCase().includes('visa') ||
      data.paymentMethodLabel.toLowerCase().includes('visa');

    const html = renderTemplate('order-confirmation.html', this.buildTemplateVars(data, isVisa));

    const info = await this.transporter.sendMail({
      from: '"ParcelHive" <no-reply@parcelhive.com>',
      to: data.to,
      subject: `Order confirmed – ${data.storeName}`,
      html,
      attachments: ORDER_CONFIRMATION_ATTACHMENTS.map((asset) => ({
        filename: asset.filename,
        path: path.join(TEMPLATE_IMAGE_PATH, asset.filename),
        cid: asset.cid,
      })),
    });
    console.log('📧 Customer mail sent:', info.messageId);
  }

  async sendAdminOrderNotificationEmail(data: OrderEmailData) {
    console.log('Preparing to send admin notification email for order:', data.orderId);
    const adminEmail = ADMIN_NOTIFICATION_EMAIL;
    console.log(`[AdminEmail] Attempting to send admin notification → ${adminEmail}`);

    try {
      const isVisa =
        data.paymentCardBrand.toLowerCase().includes('visa') ||
        data.paymentMethodLabel.toLowerCase().includes('visa');

      const html = renderTemplate(
        'admin-order-notification.html',
        this.buildTemplateVars(data, isVisa),
      );

      const info = await this.transporter.sendMail({
        from: '"ParcelHive" <no-reply@parcelhive.com>',
        to: adminEmail,
        subject: `New order received – ${data.storeName} #${data.referenceNumber}`,
        html,
        attachments: ORDER_CONFIRMATION_ATTACHMENTS.map((asset) => ({
          filename: asset.filename,
          path: path.join(TEMPLATE_IMAGE_PATH, asset.filename),
          cid: asset.cid,
        })),
      });
      console.log('📧 Admin notification sent:', info.messageId);
    } catch (error) {
      console.log('❌ Admin notification email failed:', { error });
    }
  }
}

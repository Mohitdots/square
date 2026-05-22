## Square POS ↔ ParcelHive Middleware (NestJS)

### What this is
- **Backend-only** middleware to receive Square webhooks, create ParcelHive locker orders, receive ParcelHive callbacks (PIN/QR), and **write back** a human-readable note to the Square order (or mark Store Pickup).

### Endpoints
- **Square webhook**: `POST /webhook/square`
- **ParcelHive webhook**: `POST /webhook/parcelhive`

### Environment
Create a runtime `.env` (where you run Node) and set:
- **DATABASE_URL** (MySQL), for example:\
  `DATABASE_URL="mysql://user:password@localhost:3306/square_parcelhive"`
- **SQUARE_WEBHOOK_SIGNATURE_KEY**
- **SQUARE_WEBHOOK_NOTIFICATION_URL** (must match Square’s configured webhook URL exactly)
- **PARCELHIVE_BASE_URL / USERNAME / PASSWORD**
- **PARCELHIVE_DEFAULT_LOCATION_UID** (locker location to send orders to)
- **PUBLIC_BASE_URL** (so we can generate `webhook_url` for ParcelHive)

### Database (MySQL)
Prisma schema is in `prisma/schema.prisma` and is configured for **MySQL**.

Recommended:
- `npm i`
- `npx prisma generate`
- `npx prisma migrate dev`
- `npm run start:dev`

### Notes / gaps to confirm
- **Square order update API**: we currently update the Square order **note** via `PUT /v2/orders/{order_id}` (needs a valid `SQUARE_ACCESS_TOKEN`). If you want a different Square field (fulfillment, custom attributes, etc.), we’ll adjust.
- **ParcelHive webhook payload**: handler supports both “lockers full” and “assigned” variants, but you should confirm exact keys (e.g., `locker_uid`, `qr_code`, etc.).


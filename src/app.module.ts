import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import * as Joi from 'joi';
import { PrismaModule } from './common/prisma/prisma.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ParcelhiveModule } from './modules/parcelhive/parcelhive.module';
import { SquareModule } from './modules/square/square.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    // ✅ STATIC HTML SUPPORT
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().default(3000),

        DATABASE_URL: Joi.string().required(),

        // Square
        SQUARE_WEBHOOK_SIGNATURE_KEY: Joi.string().required(),
        // Must match the exact public URL Square calls (including path).
        SQUARE_WEBHOOK_NOTIFICATION_URL: Joi.string().required(),
        SQUARE_ACCESS_TOKEN: Joi.string().optional(),
        SQUARE_ENV: Joi.string().valid('sandbox', 'production').default('sandbox'),
        EMAIL_STORE_NAME: Joi.string().optional(),
        EMAIL_LOGO_URL: Joi.string().optional(),
        EMAIL_PICKUP_ADDRESS: Joi.string().optional(),
        EMAIL_PICKUP_PHONE: Joi.string().optional(),
        EMAIL_MAP_LAT: Joi.string().optional(),
        EMAIL_MAP_LNG: Joi.string().optional(),

        // ParcelHive
        PARCELHIVE_BASE_URL: Joi.string().required(),
        PARCELHIVE_USERNAME: Joi.string().required(),
        PARCELHIVE_PASSWORD: Joi.string().required(),
        PARCELHIVE_DEFAULT_LOCATION_UID: Joi.string().optional(),
        PUBLIC_BASE_URL: Joi.string().optional(),
        // Optional shared secret for ParcelHive webhook calls (header: x-parcelhive-webhook-secret)
        PARCELHIVE_WEBHOOK_SECRET: Joi.string().optional(),
      }),
    }),
    PrismaModule,
    OrdersModule,
    ParcelhiveModule,
    SquareModule,
    WebhooksModule,
  ],
})
export class AppModule {}

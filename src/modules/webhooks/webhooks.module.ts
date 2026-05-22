import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { OrdersModule } from '../orders/orders.module';
import { ParcelhiveModule } from '../parcelhive/parcelhive.module';
import { SquareModule } from '../square/square.module';
import { SystemModule } from '../system/system.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [OrdersModule, ParcelhiveModule, SquareModule,SystemModule,MailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

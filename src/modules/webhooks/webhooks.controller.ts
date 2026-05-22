import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { SystemService } from '../system/system.service';

@Controller('webhook')
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    private readonly systemService: SystemService, // 👈 inject
  ) {}

  private async checkSystem() {
    const status = await this.systemService.getStatus();
    if (!status.enabled) {
      throw new ServiceUnavailableException(status.reason || 'System is disabled');
    }
  }

  @Post('square_sss')
  async squareWebhook(@Req() req: Request, @Headers() headers: Record<string, any>) {
    await this.checkSystem(); // 👈 SYSTEM CHECK

    console.log('square hook called');

    const rawBody = req.body as unknown as Buffer;
    const signatureHeader = headers['x-square-signature'] as string | undefined;

    return this.service.handleSquareWebhook({
      rawBody,
      headers,
      signatureHeader,
      path: req.originalUrl,
    });
  }

  @Get('test')
  async testHook() {
    await this.checkSystem(); // 👈 SYSTEM CHECK

    console.log('test calling');
    await this.service.testLocker();
    return { ok: true };
  }

  @Get('order')
  async orderHook() {
    await this.checkSystem(); // 👈 SYSTEM CHECK

    console.log('test order');
    await this.service.testOrder();
    return { ok: true };
  }

  @Post('parcelhive')
  async parcelhiveWebhook(@Headers() headers: Record<string, any>, @Body() body: any) {
    console.log('parcelhive hook called. ');

    await this.checkSystem(); // 👈 SYSTEM CHECK

    return this.service.handleParcelHiveWebhook({ headers, body });
  }
}

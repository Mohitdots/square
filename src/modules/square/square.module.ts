import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SquareClient } from './square.client';
import { SquareWebhookVerifier } from './square-webhook.verifier';

@Module({
  imports: [HttpModule],
  providers: [SquareClient, SquareWebhookVerifier],
  exports: [SquareClient, SquareWebhookVerifier],
})
export class SquareModule {}

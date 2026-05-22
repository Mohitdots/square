import { NestFactory } from '@nestjs/core';
import { json, raw } from 'body-parser';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // Square webhook verification requires access to raw request body.
  // We parse ONLY that route as raw, then use JSON parser for the rest.
  app.use(['/webhook/square', '/webhook/square_sss'], raw({ type: 'application/json' }));
  app.use(json({ limit: '2mb' }));

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 5100);
  await app.listen(port);
}

bootstrap();

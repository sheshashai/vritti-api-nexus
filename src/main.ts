import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Register cookie support
  await app.register(fastifyCookie);

  // Enable CORS for frontend applications
  app.enableCors({
    origin: [
      'http://localhost:5173', // Host app
      'http://localhost:3001', // Auth MF
      'http://localhost:5174', // Other possible ports
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API Nexus running on http://localhost:${port}`);
}
bootstrap();

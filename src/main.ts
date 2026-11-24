import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarInterfaz } from './interfaz/configurar-interfaz';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurarInterfaz(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

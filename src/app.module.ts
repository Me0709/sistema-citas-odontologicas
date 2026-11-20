import { Module } from '@nestjs/common';
import { BaseDeDatosModule } from './base-de-datos/base-de-datos.module';
import { ComunModule } from './comun/comun.module';
import { SaludController } from './salud/salud.controller';

@Module({
  imports: [BaseDeDatosModule, ComunModule],
  controllers: [SaludController],
})
export class AppModule {}

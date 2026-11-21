import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { BaseDeDatosModule } from './base-de-datos/base-de-datos.module';
import { ComunModule } from './comun/comun.module';
import { ProcedimientosModule } from './procedimientos/procedimientos.module';
import { SaludController } from './salud/salud.controller';
<<<<<<< HEAD
import { DisponibilidadModule } from './disponibilidad/disponibilidad.module';

@Module({
  imports: [BaseDeDatosModule, ComunModule, ProcedimientosModule, DisponibilidadModule],
=======
import { PacientesModule } from './pacientes/pacientes.module';

@Module({
  imports: [BaseDeDatosModule, ComunModule, ProcedimientosModule, PacientesModule],
>>>>>>> origin/develop
  controllers: [SaludController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}

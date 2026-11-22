import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { PacientesModule } from '../pacientes/pacientes.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { Cita } from './cita.entity';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';
import { LlegadasController } from './llegadas.controller';
import { LlegadasService } from './llegadas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cita]),
    PacientesModule,
    ProcedimientosModule,
    DisponibilidadModule,
  ],
  controllers: [CitasController, LlegadasController],
  providers: [CitasService, LlegadasService],
  exports: [CitasService],
})
export class CitasModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { PacientesModule } from '../pacientes/pacientes.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { Cita } from './cita.entity';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cita]), PacientesModule, ProcedimientosModule, DisponibilidadModule],
  controllers: [CitasController],
  providers: [CitasService],
  exports: [CitasService],
})
export class CitasModule {}
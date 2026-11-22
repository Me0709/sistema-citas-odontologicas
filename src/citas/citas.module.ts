import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { PacientesModule } from '../pacientes/pacientes.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { Cita } from './cita.entity';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cita, FranjaHoraria]), PacientesModule, ProcedimientosModule],
  controllers: [CitasController],
  providers: [CitasService],
  exports: [CitasService],
})
export class CitasModule {}

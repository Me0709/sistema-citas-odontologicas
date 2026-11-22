import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { PacientesModule } from '../pacientes/pacientes.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { Cita } from './cita.entity';
import { AtencionController } from './atencion.controller';
import { AtencionService } from './atencion.service';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';
import { LlegadasController } from './llegadas.controller';
import { LlegadasService } from './llegadas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cita, FranjaHoraria]), PacientesModule, ProcedimientosModule],
  controllers: [CitasController, LlegadasController, AtencionController, IncidenciasController],
  providers: [CitasService, LlegadasService, AtencionService, IncidenciasService],
  exports: [CitasService],
})
export class CitasModule {}

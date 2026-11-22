import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { FlexibilidadModule } from '../flexibilidad/flexibilidad.module';
import { Paciente } from '../pacientes/paciente.entity';
import { EstimacionCita } from './estimacion-cita.entity';
import { EstimacionController } from './estimacion.controller';
import { EstimacionService } from './estimacion.service';
import { Notificacion } from './notificacion.entity';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cita, Paciente, EstimacionCita, Notificacion]),
    FlexibilidadModule,
  ],
  controllers: [EstimacionController, NotificacionesController],
  providers: [EstimacionService, NotificacionesService],
  exports: [EstimacionService],
})
export class EstimacionModule {}

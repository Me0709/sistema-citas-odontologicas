import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { PropuestaReprogramacion } from './propuesta-reprogramacion.entity';
import { ReprogramacionController } from './reprogramacion.controller';
import { ReprogramacionService } from './reprogramacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([PropuestaReprogramacion, Cita, FranjaHoraria])],
  controllers: [ReprogramacionController],
  providers: [ReprogramacionService],
})
export class ReprogramacionModule {}

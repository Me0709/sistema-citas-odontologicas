import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { Notificacion } from '../estimacion/notificacion.entity';
import { FlexibilidadModule } from '../flexibilidad/flexibilidad.module';
import { AlternativasController } from './alternativas.controller';
import { AlternativasService } from './alternativas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cita, Notificacion]),
    DisponibilidadModule,
    FlexibilidadModule,
  ],
  controllers: [AlternativasController],
  providers: [AlternativasService],
})
export class ReordenamientoModule {}

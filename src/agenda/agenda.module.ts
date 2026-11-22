import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { FlexibilidadModule } from '../flexibilidad/flexibilidad.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cita]), DisponibilidadModule, FlexibilidadModule],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}

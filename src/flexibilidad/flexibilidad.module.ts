import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CitasModule } from '../citas/citas.module';
import { FlexibilidadCita } from './flexibilidad-cita.entity';
import { FlexibilidadCitaService } from './flexibilidad-cita.service';
import { FlexibilidadController } from './flexibilidad.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FlexibilidadCita]), CitasModule],
  controllers: [FlexibilidadController],
  providers: [FlexibilidadCitaService],
  exports: [FlexibilidadCitaService],
})
export class FlexibilidadModule {}

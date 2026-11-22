import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Procedimiento } from './procedimiento.entity';
import { ProcedimientosController } from './procedimientos.controller';
import { ProcedimientosService } from './procedimientos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Procedimiento])],
  controllers: [ProcedimientosController],
  providers: [ProcedimientosService],
  exports: [ProcedimientosService],
})
export class ProcedimientosModule {}

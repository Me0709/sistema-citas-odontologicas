import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ActualizarProcedimientoDto } from './dto/actualizar-procedimiento.dto';
import { CrearProcedimientoDto } from './dto/crear-procedimiento.dto';
import { ProcedimientosService } from './procedimientos.service';

@Controller('procedimientos')
export class ProcedimientosController {
  constructor(private readonly servicio: ProcedimientosService) {}

  @Post()
  crear(@Body() dto: CrearProcedimientoDto) {
    return this.servicio.crear(dto);
  }

  @Get()
  listar(@Query('incluirInactivos') incluirInactivos?: string) {
    return this.servicio.listar(incluirInactivos === 'true');
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Patch(':id/desactivar')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.desactivar(id);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProcedimientoDto) {
    return this.servicio.actualizar(id, dto);
  }
}

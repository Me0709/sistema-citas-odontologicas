import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AceptarPropuestaDto } from './dto/aceptar-propuesta.dto';
import { CrearPropuestaDto } from './dto/crear-propuesta.dto';
import { ReprogramacionService } from './reprogramacion.service';

@Controller()
export class ReprogramacionController {
  constructor(private readonly servicio: ReprogramacionService) {}

  @Post('citas/:citaId/propuestas-reprogramacion')
  crear(@Param('citaId', ParseIntPipe) citaId: number, @Body() dto: CrearPropuestaDto) {
    return this.servicio.crear(citaId, dto);
  }

  @Post('propuestas-reprogramacion/vencimientos')
  @HttpCode(200)
  vencer() {
    return this.servicio.vencer();
  }

  @Get('propuestas-reprogramacion/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Post('propuestas-reprogramacion/:id/aceptacion')
  @HttpCode(200)
  aceptar(@Param('id', ParseIntPipe) id: number, @Body() dto: AceptarPropuestaDto) {
    return this.servicio.aceptar(id, dto);
  }

  @Post('propuestas-reprogramacion/:id/rechazo')
  @HttpCode(200)
  rechazar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.rechazar(id);
  }
}

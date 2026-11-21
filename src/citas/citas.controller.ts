import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CitasService } from './citas.service';
import { CrearCitaDto } from './dto/crear-cita.dto';

@Controller('citas')
export class CitasController {
  constructor(private readonly servicio: CitasService) {}

  @Post()
  crear(@Body() dto: CrearCitaDto) {
    return this.servicio.crear(dto);
  }

  @Get()
  listar(@Query('fecha') fecha?: string, @Query('pacienteId') pacienteId?: string) {
    return this.servicio.listar(fecha, pacienteId);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }
}

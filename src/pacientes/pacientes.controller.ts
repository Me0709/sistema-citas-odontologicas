import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { PacientesService } from './pacientes.service';

@Controller('pacientes')
export class PacientesController {
  constructor(private readonly servicio: PacientesService) {}

  @Post()
  crear(@Body() dto: CrearPacienteDto) {
    return this.servicio.crear(dto);
  }

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }
}

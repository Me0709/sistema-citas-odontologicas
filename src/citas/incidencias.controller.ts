import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AvisarRetrasoDto } from './dto/avisar-retraso.dto';
import { CancelarCitaDto } from './dto/cancelar-cita.dto';
import { RegistrarInasistenciaDto } from './dto/registrar-inasistencia.dto';
import { IncidenciasService } from './incidencias.service';

@Controller('citas')
export class IncidenciasController {
  constructor(private readonly servicio: IncidenciasService) {}

  @Post(':id/aviso-retraso')
  @HttpCode(200)
  avisarRetraso(@Param('id', ParseIntPipe) id: number, @Body() dto: AvisarRetrasoDto) {
    return this.servicio.avisarRetraso(id, dto);
  }

  @Post(':id/cancelacion')
  @HttpCode(200)
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelarCitaDto) {
    return this.servicio.cancelar(id, dto);
  }

  @Post(':id/inasistencia')
  @HttpCode(200)
  registrarInasistencia(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarInasistenciaDto,
  ) {
    return this.servicio.registrarInasistencia(id, dto);
  }
}

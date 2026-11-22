import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reloj } from '../comun/reloj';
import { horaAMinutos } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { RegistrarHoraAtencionDto } from './dto/registrar-hora-atencion.dto';
import { EstadoCita } from './estado-cita';
import { horaIndicadaOActual } from './hora-actual';

const ESTADOS_SIN_LLEGADA: EstadoCita[] = [EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA];

@Injectable()
export class AtencionService {
  constructor(
    @InjectRepository(Cita)
    private readonly repositorio: Repository<Cita>,
    private readonly reloj: Reloj,
  ) {}

  async iniciar(id: number, dto: RegistrarHoraAtencionDto): Promise<Cita> {
    const cita = await this.obtener(id);

    if (ESTADOS_SIN_LLEGADA.includes(cita.estado)) {
      throw new ConflictException(
        'El paciente no tiene la llegada registrada; registre primero su llegada',
      );
    }
    if (cita.estado !== EstadoCita.EN_SALA) {
      throw new ConflictException(
        `No se puede iniciar la atención de una cita en estado "${cita.estado}"`,
      );
    }

    const hora = horaIndicadaOActual(this.reloj, cita, dto.hora);
    if (horaAMinutos(hora) < horaAMinutos(cita.horaLlegada!)) {
      throw new BadRequestException(
        `La atención no puede iniciar antes de la llegada del paciente (${cita.horaLlegada})`,
      );
    }

    cita.horaInicioReal = hora;
    cita.estado = EstadoCita.EN_ATENCION;
    return this.repositorio.save(cita);
  }

  async finalizar(id: number, dto: RegistrarHoraAtencionDto): Promise<Cita> {
    const cita = await this.obtener(id);

    if (cita.estado === EstadoCita.EN_SALA) {
      throw new ConflictException('La atención todavía no se inició; inicie primero la atención');
    }
    if (cita.estado !== EstadoCita.EN_ATENCION) {
      throw new ConflictException(
        `No se puede finalizar la atención de una cita en estado "${cita.estado}"`,
      );
    }

    const hora = horaIndicadaOActual(this.reloj, cita, dto.hora);
    const duracionReal = horaAMinutos(hora) - horaAMinutos(cita.horaInicioReal!);
    if (duracionReal <= 0) {
      throw new BadRequestException(
        `La hora de fin debe ser posterior a la de inicio de la atención (${cita.horaInicioReal})`,
      );
    }

    cita.horaFinReal = hora;
    cita.duracionRealMin = duracionReal;
    cita.diferenciaDuracionMin = duracionReal - cita.duracionMin;
    cita.estado = EstadoCita.ATENDIDA;
    return this.repositorio.save(cita);
  }

  private async obtener(id: number): Promise<Cita> {
    const cita = await this.repositorio.findOneBy({ id });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${id}`);
    }
    return cita;
  }
}

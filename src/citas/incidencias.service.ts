import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TIEMPO_MAXIMO_ESPERA_MIN } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { horaAMinutos, minutosAHora } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { AvisarRetrasoDto } from './dto/avisar-retraso.dto';
import { CancelarCitaDto } from './dto/cancelar-cita.dto';
import { RegistrarInasistenciaDto } from './dto/registrar-inasistencia.dto';
import { EstadoCita } from './estado-cita';
import { horaIndicadaOActual } from './hora-actual';
import { OrigenCancelacion } from './origen-cancelacion';

export type RespuestaCancelacion = Cita & { ofreceReprogramar: boolean };

const ESTADOS_ANTES_DE_LA_LLEGADA: EstadoCita[] = [EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA];

const ESTADOS_CANCELABLES: Record<OrigenCancelacion, EstadoCita[]> = {
  [OrigenCancelacion.PACIENTE]: [...ESTADOS_ANTES_DE_LA_LLEGADA, EstadoCita.POR_REPROGRAMAR],
  // El consultorio también puede cancelar con el paciente ya en sala (p. ej. una emergencia).
  [OrigenCancelacion.CONSULTORIO]: [
    ...ESTADOS_ANTES_DE_LA_LLEGADA,
    EstadoCita.POR_REPROGRAMAR,
    EstadoCita.EN_SALA,
  ],
};

@Injectable()
export class IncidenciasService {
  constructor(
    @InjectRepository(Cita)
    private readonly repositorio: Repository<Cita>,
    private readonly reloj: Reloj,
  ) {}

  /** Escenario 1: el paciente avisa que llegará tarde. */
  async avisarRetraso(id: number, dto: AvisarRetrasoDto): Promise<Cita> {
    const cita = await this.obtener(id);
    if (!ESTADOS_ANTES_DE_LA_LLEGADA.includes(cita.estado)) {
      throw new ConflictException(
        `No se puede avisar el retraso de una cita en estado "${cita.estado}"`,
      );
    }

    cita.avisoRetrasoMin = dto.minutos;
    return this.repositorio.save(cita);
  }

  /** Escenarios 2 y 3: cancelación pedida por el paciente o hecha por el consultorio. */
  async cancelar(id: number, dto: CancelarCitaDto): Promise<RespuestaCancelacion> {
    const cita = await this.obtener(id);
    if (!ESTADOS_CANCELABLES[dto.origen].includes(cita.estado)) {
      throw new ConflictException(`No se puede cancelar una cita en estado "${cita.estado}"`);
    }

    cita.estado = EstadoCita.CANCELADA;
    cita.canceladaPor = dto.origen;
    cita.motivoCancelacion = dto.motivo ?? null;
    const guardada = await this.repositorio.save(cita);
    return { ...guardada, ofreceReprogramar: dto.origen === OrigenCancelacion.CONSULTORIO };
  }

  /** Escenario 4: el paciente no llegó dentro del tiempo máximo de espera. */
  async registrarInasistencia(id: number, dto: RegistrarInasistenciaDto): Promise<Cita> {
    const cita = await this.obtener(id);
    if (!ESTADOS_ANTES_DE_LA_LLEGADA.includes(cita.estado)) {
      throw new ConflictException(
        `No se puede registrar la inasistencia de una cita en estado "${cita.estado}"`,
      );
    }

    const hora = horaIndicadaOActual(this.reloj, cita, dto.hora);
    const ultimaHoraDeLlegada = horaAMinutos(cita.horaInicio) + TIEMPO_MAXIMO_ESPERA_MIN;
    if (horaAMinutos(hora) <= ultimaHoraDeLlegada) {
      throw new ConflictException(
        `Aún no vence el tiempo máximo de espera: el paciente puede llegar hasta las ${minutosAHora(ultimaHoraDeLlegada)}`,
      );
    }

    cita.estado = EstadoCita.INASISTENCIA;
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

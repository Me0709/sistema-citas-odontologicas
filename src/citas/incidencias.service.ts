import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  LLAVE_BLOQUEO_AGENDA,
  OFFSET_CONSULTORIO_MIN,
  TIEMPO_MAXIMO_ESPERA_MIN,
} from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, horaAMinutos, InstanteLocal, minutosAHora } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { AvisarRetrasoDto } from './dto/avisar-retraso.dto';
import { CancelarCitaDto } from './dto/cancelar-cita.dto';
import { RegistrarInasistenciaDto } from './dto/registrar-inasistencia.dto';
import { EstadoCita } from './estado-cita';
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
    private readonly dataSource: DataSource,
    private readonly reloj: Reloj,
  ) {}

  /** Escenario 1: el paciente avisa que llegará tarde. */
  async avisarRetraso(id: number, dto: AvisarRetrasoDto): Promise<Cita> {
    return this.enTransaccion(async (manager) => {
      const cita = await this.obtener(manager, id);
      if (!ESTADOS_ANTES_DE_LA_LLEGADA.includes(cita.estado)) {
        throw new ConflictException(
          `No se puede avisar el retraso de una cita en estado "${cita.estado}"`,
        );
      }

      cita.avisoRetrasoMin = dto.minutos;
      return manager.save(cita);
    });
  }

  /** Escenarios 2 y 3: cancelación pedida por el paciente o hecha por el consultorio. */
  async cancelar(id: number, dto: CancelarCitaDto): Promise<RespuestaCancelacion> {
    return this.enTransaccion(async (manager) => {
      const cita = await this.obtener(manager, id);
      if (!ESTADOS_CANCELABLES[dto.origen].includes(cita.estado)) {
        throw new ConflictException(`No se puede cancelar una cita en estado "${cita.estado}"`);
      }

      cita.estado = EstadoCita.CANCELADA;
      cita.canceladaPor = dto.origen;
      cita.motivoCancelacion = dto.motivo ?? null;
      const guardada = await manager.save(cita);
      return { ...guardada, ofreceReprogramar: dto.origen === OrigenCancelacion.CONSULTORIO };
    });
  }

  /** Escenario 4: el paciente no llegó dentro del tiempo máximo de espera. */
  async registrarInasistencia(id: number, dto: RegistrarInasistenciaDto): Promise<Cita> {
    return this.enTransaccion(async (manager, ahora) => {
      const cita = await this.obtener(manager, id);
      if (!ESTADOS_ANTES_DE_LA_LLEGADA.includes(cita.estado)) {
        throw new ConflictException(
          `No se puede registrar la inasistencia de una cita en estado "${cita.estado}"`,
        );
      }

      // Una cita de un día anterior ya venció por completo; la de un día futuro, todavía no.
      if (cita.fecha > ahora.fecha) {
        throw new ConflictException(
          `La cita es del ${cita.fecha}; aún no se puede registrar la inasistencia`,
        );
      }
      if (cita.fecha === ahora.fecha) {
        const hora = dto.hora ?? minutosAHora(ahora.minutos);
        const ultimaHoraDeLlegada = horaAMinutos(cita.horaInicio) + TIEMPO_MAXIMO_ESPERA_MIN;
        if (horaAMinutos(hora) <= ultimaHoraDeLlegada) {
          throw new ConflictException(
            `Aún no vence el tiempo máximo de espera: el paciente puede llegar hasta las ${minutosAHora(ultimaHoraDeLlegada)}`,
          );
        }
      }

      cita.estado = EstadoCita.INASISTENCIA;
      return manager.save(cita);
    });
  }

  /**
   * Toma el bloqueo de la agenda antes de leer la cita, para no pisar una llegada (HU-06),
   * un cambio de horario (HU-03) u otra incidencia que ocurran a la vez.
   */
  private enTransaccion<T>(
    accion: (manager: EntityManager, ahora: InstanteLocal) => Promise<T>,
  ): Promise<T> {
    const ahora = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN);
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);
      return accion(manager, ahora);
    });
  }

  private async obtener(manager: EntityManager, id: number): Promise<Cita> {
    const cita = await manager.findOneBy(Cita, { id });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${id}`);
    }
    return cita;
  }
}

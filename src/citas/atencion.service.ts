import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LLAVE_BLOQUEO_AGENDA, OFFSET_CONSULTORIO_MIN } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, horaAMinutos, InstanteLocal } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { RegistrarHoraAtencionDto } from './dto/registrar-hora-atencion.dto';
import { EstadoCita } from './estado-cita';
import { horaIndicadaOActual } from './hora-actual';

const ESTADOS_SIN_LLEGADA: EstadoCita[] = [EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA];

@Injectable()
export class AtencionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reloj: Reloj,
  ) {}

  async iniciar(id: number, dto: RegistrarHoraAtencionDto): Promise<Cita> {
    return this.enTransaccion(async (manager, ahora) => {
      const cita = await this.obtener(manager, id);

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

      const hora = horaIndicadaOActual(ahora, cita, dto.hora);
      if (horaAMinutos(hora) < horaAMinutos(cita.horaLlegada!)) {
        throw new BadRequestException(
          `La atención no puede iniciar antes de la llegada del paciente (${cita.horaLlegada})`,
        );
      }

      cita.horaInicioReal = hora;
      cita.estado = EstadoCita.EN_ATENCION;
      return manager.save(cita);
    });
  }

  async finalizar(id: number, dto: RegistrarHoraAtencionDto): Promise<Cita> {
    return this.enTransaccion(async (manager, ahora) => {
      const cita = await this.obtener(manager, id);

      if (cita.estado === EstadoCita.EN_SALA) {
        throw new ConflictException('La atención todavía no se inició; inicie primero la atención');
      }
      if (cita.estado !== EstadoCita.EN_ATENCION) {
        throw new ConflictException(
          `No se puede finalizar la atención de una cita en estado "${cita.estado}"`,
        );
      }

      const hora = horaIndicadaOActual(ahora, cita, dto.hora);
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
      return manager.save(cita);
    });
  }

  /**
   * Toma el bloqueo de la agenda antes de leer la cita, para no pisar un cambio de horario
   * (HU-03) ni una marca de inasistencia (HU-08) que ocurran a la vez.
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

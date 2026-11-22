import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  LLAVE_BLOQUEO_AGENDA,
  OFFSET_CONSULTORIO_MIN,
  TIEMPO_MAXIMO_ESPERA_MIN,
  TOLERANCIA_PUNTUALIDAD_MIN,
} from '../comun/constantes';
import { EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, horaAMinutos, minutosAHora } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { RegistrarLlegadaDto } from './dto/registrar-llegada.dto';
import { EstadoCita } from './estado-cita';

const ESTADOS_QUE_ADMITEN_LLEGADA: EstadoCita[] = [EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA];

@Injectable()
export class LlegadasService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reloj: Reloj,
    private readonly eventos: EventosAgenda,
  ) {}

  async registrar(id: number, dto: RegistrarLlegadaDto): Promise<Cita> {
    const ahora = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN);

    const registrada = await this.dataSource.transaction(async (manager) => {
      // La cita se lee después de tomar el bloqueo de la agenda, para no pisar un cambio
      // de horario (HU-03) ni una marca de inasistencia (HU-08) que ocurran a la vez.
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);

      const cita = await manager.findOneBy(Cita, { id });
      if (!cita) {
        throw new NotFoundException(`No existe la cita ${id}`);
      }

      if (cita.estado === EstadoCita.INASISTENCIA) {
        throw this.errorInasistencia('La cita ya figura como inasistencia', cita);
      }
      if (!ESTADOS_QUE_ADMITEN_LLEGADA.includes(cita.estado)) {
        throw new ConflictException(
          `No se puede registrar la llegada de una cita en estado "${cita.estado}"`,
        );
      }
      if (cita.fecha !== ahora.fecha) {
        throw new ConflictException(
          `La cita es del ${cita.fecha}; la llegada solo se registra el día de la cita`,
        );
      }

      const horaLlegada = dto.horaLlegada ?? minutosAHora(ahora.minutos);
      const diferencia = horaAMinutos(horaLlegada) - horaAMinutos(cita.horaInicio);

      if (diferencia > TIEMPO_MAXIMO_ESPERA_MIN) {
        throw this.errorInasistencia(
          `El paciente superó el tiempo máximo de espera de ${TIEMPO_MAXIMO_ESPERA_MIN} minutos; la cita debe registrarse como inasistencia`,
          cita,
        );
      }

      cita.horaLlegada = horaLlegada;
      cita.minutosRetraso = diferencia > TOLERANCIA_PUNTUALIDAD_MIN ? diferencia : 0;
      cita.estado = EstadoCita.EN_SALA;
      return manager.save(cita);
    });

    // Después de confirmar la llegada se recalculan las horas estimadas del día (HU-09).
    await this.eventos.emitir({ tipo: 'llegada_registrada', fecha: registrada.fecha });
    return registrada;
  }

  private errorInasistencia(mensaje: string, cita: Cita): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: mensaje,
      ofreceReprogramar: true,
      cita: { id: cita.id, fecha: cita.fecha, horaInicio: cita.horaInicio, estado: cita.estado },
    });
  }
}

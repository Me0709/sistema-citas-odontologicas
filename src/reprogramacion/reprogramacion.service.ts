import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { ESTADOS_QUE_OCUPAN_AGENDA, EstadoCita } from '../citas/estado-cita';
import {
  BLOQUE_MINIMO_MIN,
  LLAVE_BLOQUEO_AGENDA,
  OFFSET_CONSULTORIO_MIN,
} from '../comun/constantes';
import { EventoAgenda, EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, diasEntre, horaAMinutos, minutosAHora } from '../comun/tiempo';
import { cabeEnHorario } from '../disponibilidad/cabe-en-horario';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { EstimacionCita } from '../estimacion/estimacion-cita.entity';
import { notificarAlAdministrador } from '../estimacion/notificar';
import { PLAZO_RESPUESTA_PROPUESTA_MIN } from './constantes';
import { AceptarPropuestaDto } from './dto/aceptar-propuesta.dto';
import { CrearPropuestaDto } from './dto/crear-propuesta.dto';
import { EstadoPropuesta, OrigenRespuesta } from './estado-propuesta';
import { PropuestaReprogramacion } from './propuesta-reprogramacion.entity';

const MIN_POR_DIA = 24 * 60;
const MS_POR_MINUTO = 60_000;

/** Estados en los que una cita admite una propuesta de nuevo horario. */
const ESTADOS_CON_PROPUESTA: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.POR_REPROGRAMAR,
];

export interface ExplicacionDelCambio {
  motivo: string;
  minutosDesplazamiento: number;
  sentido: 'atrasa' | 'adelanta';
  horarioActual: { fecha: string; horaInicio: string };
  horarioPropuesto: { fecha: string; horaInicio: string };
}

export type PropuestaConExplicacion = PropuestaReprogramacion & {
  explicacion: ExplicacionDelCambio;
};

export interface RespuestaAceptacion {
  propuesta: PropuestaReprogramacion;
  cita: Cita;
}

export interface RespuestaRechazo {
  propuesta: PropuestaReprogramacion;
  notificarAdministrador: true;
  /** Pendiente de integrar con HU-10: el sistema debe proponer la siguiente alternativa. */
  evaluarSiguienteAlternativa: true;
}

export interface RespuestaVencimientos {
  vencidas: PropuestaReprogramacion[];
  notificarAdministrador: boolean;
}

const seCruza = (
  cita: Pick<Cita, 'horaInicio' | 'horaFin'>,
  inicio: number,
  fin: number,
): boolean => horaAMinutos(cita.horaInicio) < fin && inicio < horaAMinutos(cita.horaFin);

@Injectable()
export class ReprogramacionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reloj: Reloj,
    private readonly eventos: EventosAgenda,
  ) {}

  /** El consultorio propone un nuevo horario; la cita queda "Por reprogramar" a la espera de respuesta. */
  async crear(citaId: number, dto: CrearPropuestaDto): Promise<PropuestaReprogramacion> {
    return this.enTransaccion(async (manager) => {
      const cita = await this.obtenerCita(manager, citaId);
      if (!ESTADOS_CON_PROPUESTA.includes(cita.estado)) {
        throw new ConflictException(
          `No se puede proponer un nuevo horario a una cita en estado "${cita.estado}"`,
        );
      }
      const pendiente = await manager.findOneBy(PropuestaReprogramacion, {
        citaId,
        estado: EstadoPropuesta.PENDIENTE,
      });
      if (pendiente) {
        throw new ConflictException(
          `La cita ya tiene la propuesta ${pendiente.id} pendiente de respuesta`,
        );
      }
      if (dto.fecha === cita.fecha && dto.horaInicio === cita.horaInicio) {
        throw new BadRequestException('El horario propuesto es el mismo de la cita');
      }

      const horaFin = await this.verificarEspacio(manager, cita, dto.fecha, dto.horaInicio);
      const ahora = this.reloj.ahora();
      const desplazamientoMin =
        diasEntre(cita.fecha, dto.fecha) * MIN_POR_DIA +
        horaAMinutos(dto.horaInicio) -
        horaAMinutos(cita.horaInicio);

      const propuesta = await manager.save(
        manager.create(PropuestaReprogramacion, {
          citaId,
          fechaOriginal: cita.fecha,
          horaInicioOriginal: cita.horaInicio,
          fecha: dto.fecha,
          horaInicio: dto.horaInicio,
          horaFin,
          motivo: dto.motivo,
          desplazamientoMin,
          estadoCitaAnterior: cita.estado,
          estado: EstadoPropuesta.PENDIENTE,
          creadaEn: ahora,
          venceEn: new Date(ahora.getTime() + PLAZO_RESPUESTA_PROPUESTA_MIN * MS_POR_MINUTO),
          respondidaEn: null,
          respondidaPor: null,
        }),
      );
      cita.estado = EstadoCita.POR_REPROGRAMAR;
      await manager.save(cita);
      return propuesta;
    });
  }

  /** Escenario 5: la propuesta con la explicación del cambio que el paciente ve antes de decidir. */
  async obtener(id: number): Promise<PropuestaConExplicacion> {
    const propuesta = await this.dataSource.manager.findOneBy(PropuestaReprogramacion, { id });
    if (!propuesta) {
      throw new NotFoundException(`No existe la propuesta ${id}`);
    }
    return {
      ...propuesta,
      explicacion: {
        motivo: propuesta.motivo,
        minutosDesplazamiento: Math.abs(propuesta.desplazamientoMin),
        sentido: propuesta.desplazamientoMin > 0 ? 'atrasa' : 'adelanta',
        horarioActual: { fecha: propuesta.fechaOriginal, horaInicio: propuesta.horaInicioOriginal },
        horarioPropuesto: { fecha: propuesta.fecha, horaInicio: propuesta.horaInicio },
      },
    };
  }

  /** Escenarios 1 y 4: mueve la cita al nuevo horario y la deja "Confirmada". */
  async aceptar(id: number, dto: AceptarPropuestaDto): Promise<RespuestaAceptacion> {
    const resultado = await this.enTransaccion(async (manager) => {
      const { propuesta, cita, ahora } = await this.cargarPendiente(manager, id);
      if (this.estaVencida(propuesta, ahora)) {
        await this.cerrarSinCambio(manager, propuesta, cita, EstadoPropuesta.VENCIDA, ahora);
        return null;
      }

      await this.verificarEspacio(manager, cita, propuesta.fecha, propuesta.horaInicio);
      cita.fecha = propuesta.fecha;
      cita.horaInicio = propuesta.horaInicio;
      cita.horaFin = propuesta.horaFin;
      cita.estado = EstadoCita.CONFIRMADA;
      propuesta.estado = EstadoPropuesta.ACEPTADA;
      propuesta.respondidaEn = ahora;
      propuesta.respondidaPor = dto.origen ?? OrigenRespuesta.PACIENTE;
      const guardada = {
        propuesta: await manager.save(propuesta),
        cita: await manager.save(cita),
      };
      // La cita cambió de horario: su estimación anterior ya no sirve.
      await manager.delete(EstimacionCita, { citaId: cita.id });
      return guardada;
    });

    const aceptada = this.resultadoOPlazoVencido(resultado);
    await this.avisarALaAgenda('propuesta_aceptada', [
      aceptada.propuesta.fechaOriginal,
      aceptada.propuesta.fecha,
    ]);
    return aceptada;
  }

  /** Escenario 2: el paciente conserva su cita original y se avisa al administrador. */
  async rechazar(id: number): Promise<RespuestaRechazo> {
    const resultado = await this.enTransaccion(async (manager) => {
      const { propuesta, cita, ahora } = await this.cargarPendiente(manager, id);
      const vencida = this.estaVencida(propuesta, ahora);
      const estado = vencida ? EstadoPropuesta.VENCIDA : EstadoPropuesta.RECHAZADA;
      await this.cerrarSinCambio(manager, propuesta, cita, estado, ahora);
      return vencida ? null : propuesta;
    });
    const rechazada = this.resultadoOPlazoVencido(resultado);
    await this.avisarALaAgenda('propuesta_rechazada', [rechazada.fechaOriginal]);
    return {
      propuesta: rechazada,
      notificarAdministrador: true,
      evaluarSiguienteAlternativa: true,
    };
  }

  /** Escenario 3: cierra las propuestas cuyo plazo venció; la cita original se mantiene. */
  async vencer(): Promise<RespuestaVencimientos> {
    const resultado = await this.enTransaccion(async (manager) => {
      const ahora = this.reloj.ahora();
      const pendientes = await manager.find(PropuestaReprogramacion, {
        where: { estado: EstadoPropuesta.PENDIENTE, venceEn: LessThanOrEqual(ahora) },
        order: { id: 'ASC' },
      });
      const citas = new Map(
        (await manager.find(Cita, { where: { id: In(pendientes.map((p) => p.citaId)) } })).map(
          (c) => [c.id, c],
        ),
      );

      const vencidas: PropuestaReprogramacion[] = [];
      for (const propuesta of pendientes) {
        vencidas.push(
          await this.cerrarSinCambio(
            manager,
            propuesta,
            citas.get(propuesta.citaId)!,
            EstadoPropuesta.VENCIDA,
            ahora,
          ),
        );
      }
      return { vencidas, notificarAdministrador: vencidas.length > 0 };
    });

    await this.avisarALaAgenda(
      'propuesta_vencida',
      resultado.vencidas.map((p) => p.fechaOriginal),
    );
    return resultado;
  }

  /** Toma el bloqueo de la agenda antes de leer, para no pisar otros cambios que ocurran a la vez. */
  private enTransaccion<T>(accion: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);
      return accion(manager);
    });
  }

  private async obtenerCita(manager: EntityManager, id: number): Promise<Cita> {
    const cita = await manager.findOneBy(Cita, { id });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${id}`);
    }
    return cita;
  }

  private async cargarPendiente(manager: EntityManager, id: number) {
    const propuesta = await manager.findOneBy(PropuestaReprogramacion, { id });
    if (!propuesta) {
      throw new NotFoundException(`No existe la propuesta ${id}`);
    }
    if (propuesta.estado !== EstadoPropuesta.PENDIENTE) {
      throw new ConflictException(`La propuesta ya fue respondida (estado "${propuesta.estado}")`);
    }
    const cita = await this.obtenerCita(manager, propuesta.citaId);
    if (cita.estado !== EstadoCita.POR_REPROGRAMAR) {
      throw new ConflictException(
        `La cita ya no está pendiente de reprogramar (estado "${cita.estado}")`,
      );
    }
    return { propuesta, cita, ahora: this.reloj.ahora() };
  }

  private estaVencida(propuesta: PropuestaReprogramacion, ahora: Date): boolean {
    return propuesta.venceEn.getTime() <= ahora.getTime();
  }

  /** Cierra la propuesta sin mover la cita, que vuelve al estado que tenía antes de proponerla. */
  private async cerrarSinCambio(
    manager: EntityManager,
    propuesta: PropuestaReprogramacion,
    cita: Cita,
    estado: EstadoPropuesta.RECHAZADA | EstadoPropuesta.VENCIDA,
    ahora: Date,
  ): Promise<PropuestaReprogramacion> {
    propuesta.estado = estado;
    if (estado === EstadoPropuesta.RECHAZADA) {
      propuesta.respondidaEn = ahora;
      propuesta.respondidaPor = OrigenRespuesta.PACIENTE;
    }
    if (cita.estado === EstadoCita.POR_REPROGRAMAR) {
      cita.estado = propuesta.estadoCitaAnterior;
      await manager.save(cita);
    }
    await notificarAlAdministrador(manager, {
      pacienteId: cita.pacienteId,
      citaId: cita.id,
      tipo: estado === EstadoPropuesta.RECHAZADA ? 'propuesta_rechazada' : 'propuesta_vencida',
      mensaje:
        estado === EstadoPropuesta.RECHAZADA
          ? `El paciente rechazó la propuesta ${propuesta.id} para la cita ${cita.id}. Evalúe la siguiente alternativa.`
          : `La propuesta ${propuesta.id} para la cita ${cita.id} venció sin respuesta; se mantiene la cita original.`,
    });
    return manager.save(propuesta);
  }

  /**
   * Avisa a la agenda después de confirmar la transacción. Solo la agenda de hoy se recalcula:
   * las horas estimadas se miden contra el reloj, que no dice nada de otro día.
   */
  private async avisarALaAgenda(tipo: EventoAgenda['tipo'], fechas: string[]): Promise<void> {
    const hoy = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN).fecha;
    if (fechas.includes(hoy)) {
      await this.eventos.emitir({ tipo, fecha: hoy });
    }
  }

  private resultadoOPlazoVencido<T>(resultado: T | null): T {
    if (resultado === null) {
      throw new ConflictException(
        `El plazo de ${PLAZO_RESPUESTA_PROPUESTA_MIN} minutos para responder venció; se mantiene la cita original`,
      );
    }
    return resultado;
  }

  /** Comprueba que la cita cabe en el horario propuesto y devuelve su hora de fin. */
  private async verificarEspacio(
    manager: EntityManager,
    cita: Cita,
    fecha: string,
    horaInicio: string,
  ): Promise<string> {
    const inicio = horaAMinutos(horaInicio);
    if (inicio % BLOQUE_MINIMO_MIN !== 0) {
      throw new BadRequestException(
        `La hora de inicio debe ser múltiplo de ${BLOQUE_MINIMO_MIN} minutos`,
      );
    }
    const fin = inicio + cita.duracionMin;

    const franjas = await manager.find(FranjaHoraria);
    if (!cabeEnHorario(franjas, fecha, inicio, fin)) {
      throw new ConflictException(
        'El horario propuesto queda fuera del horario de atención del odontólogo',
      );
    }
    const citasDelDia = await manager.find(Cita, {
      where: { fecha, estado: In(ESTADOS_QUE_OCUPAN_AGENDA) },
    });
    if (citasDelDia.some((c) => c.id !== cita.id && seCruza(c, inicio, fin))) {
      throw new ConflictException('El horario propuesto está ocupado por otra cita');
    }
    return minutosAHora(fin);
  }
}

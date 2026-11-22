import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { OFFSET_CONSULTORIO_MIN } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, horaAMinutos, minutosAHora } from '../comun/tiempo';
import { cabeEnHorario } from '../disponibilidad/cabe-en-horario';
import { DisponibilidadService } from '../disponibilidad/disponibilidad.service';
import { odontologoLibreDesde, retrasoAvisado, sinAdelanto } from '../estimacion/calculo-agenda';
import { Notificacion } from '../estimacion/notificacion.entity';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { MAX_CITAS_A_EVALUAR } from './constantes';
import { AnalizarAgendaDto } from './dto/analizar-agenda.dto';
import {
  Alternativa,
  EventoDisruptivo,
  Explicacion,
  proponerAlternativas,
  TipoEvento,
} from './dominio/alternativas';
import { Flexibilidad } from './dominio/flexibilidad';
import { CitaPendiente, recalcularHorasEstimadas } from './dominio/hora-estimada';

const MS_POR_MINUTO = 60_000;

/** Citas que todavía no comienzan y cuya hora puede cambiar. "Por reprogramar" aún ocupa su espacio. */
const ESTADOS_REPROGRAMABLES: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.POR_REPROGRAMAR,
];

export interface AsignacionPropuesta {
  citaId: number;
  horaPrevista: string;
  horaPropuesta: string;
  /** Positivo si la cita se atrasa, negativo si se adelanta, respecto a su hora programada. */
  desplazamientoMin: number;
}

export interface AlternativaPropuesta {
  asignaciones: AsignacionPropuesta[];
  desplazamientoTotalMin: number;
  pacientesDesplazados: number;
}

interface BaseRespuesta {
  evento: EventoDisruptivo;
  fecha: string;
  citasEvaluadas: number;
  /** Citas pendientes que quedaron fuera del análisis por superar el máximo que se evalúa a la vez. */
  citasNoEvaluadas: number;
}

export type RespuestaAlternativas =
  | (BaseRespuesta & {
      hayAlternativa: true;
      propuesta: AlternativaPropuesta;
      otras: AlternativaPropuesta[];
      explicacion: Explicacion;
    })
  | (BaseRespuesta & {
      hayAlternativa: false;
      citasEnConflicto: { citaId: number; horaPrevista: string; flexibilidad: Flexibilidad }[];
      motivo: string;
    });

const EVENTOS: Record<TipoEvento, string> = {
  retraso: 'el aviso de retraso',
  cancelacion: 'la cancelación',
  inasistencia: 'la inasistencia',
  propuesta_rechazada: 'el rechazo de una propuesta de reprogramación',
  propuesta_vencida: 'el vencimiento de una propuesta de reprogramación',
};

function resumenDeLaPropuesta(
  evento: EventoDisruptivo,
  propuesta: AlternativaPropuesta,
  otras: number,
): string {
  const cambios = propuesta.asignaciones
    .filter((a) => a.desplazamientoMin !== 0)
    .map((a) => `cita ${a.citaId} de ${a.horaPrevista} a ${a.horaPropuesta}`)
    .join('; ');
  return (
    `Tras ${EVENTOS[evento.tipo]}, el sistema propone: ${cambios} ` +
    `(desplazamiento total ${propuesta.desplazamientoTotalMin} min). ` +
    `Hay ${otras} alternativa(s) más; consulte POST /agenda/alternativas para el detalle.`
  );
}

@Injectable()
export class AlternativasService {
  constructor(
    @InjectRepository(Cita)
    private readonly citas: Repository<Cita>,
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
    private readonly disponibilidad: DisponibilidadService,
    private readonly flexibilidad: FlexibilidadCitaService,
    private readonly reloj: Reloj,
  ) {}

  /** Analiza la agenda de hoy tras un evento disruptivo y propone cómo reprogramar las citas pendientes. */
  async proponer(dto: AnalizarAgendaDto): Promise<RespuestaAlternativas> {
    if (dto.citaId !== undefined && !(await this.citas.findOneBy({ id: dto.citaId }))) {
      throw new NotFoundException(`No existe la cita ${dto.citaId}`);
    }
    return this.analizar({ tipo: dto.evento, citaId: dto.citaId });
  }

  /**
   * Evalúa la agenda sin que nadie lo pida, tras un evento de la agenda. Si hay una alternativa que
   * mueve a algún paciente, deja el resumen para el administrador; si no hay ninguna, el análisis
   * ya lo alerta.
   */
  async evaluarAutomaticamente(evento: EventoDisruptivo): Promise<void> {
    const respuesta = await this.analizar(evento);
    if (respuesta.hayAlternativa && respuesta.propuesta.pacientesDesplazados > 0) {
      await this.notificaciones.save({
        destinatario: 'administrador',
        pacienteId: null,
        citaId: null,
        tipo: 'alternativas_propuestas',
        destino: 'administrador',
        mensaje: resumenDeLaPropuesta(evento, respuesta.propuesta, respuesta.otras.length),
      });
    }
  }

  private async analizar(evento: EventoDisruptivo): Promise<RespuestaAlternativas> {
    const ahora = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN);
    const fecha = ahora.fecha;
    const delDia = await this.citas.find({ where: { fecha } });

    const reprogramables = delDia
      .filter((c) => ESTADOS_REPROGRAMABLES.includes(c.estado))
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.id - b.id);
    const evaluadas = reprogramables.slice(0, MAX_CITAS_A_EVALUAR);
    const flexibilidades = await this.flexibilidad.porCitas(evaluadas.map((c) => c.id));
    const flexibilidadDe = (c: Cita) => flexibilidades.get(c.id) ?? Flexibilidad.MANTENER;

    // Las horas del consultorio se pasan a instantes "de pared" en UTC, para no depender de la zona del servidor.
    const inicioDelDia = Date.parse(`${fecha}T00:00:00Z`);
    const aInstante = (minutos: number) => new Date(inicioDelDia + minutos * MS_POR_MINUTO);
    const aMinutos = (instante: Date) => (instante.getTime() - inicioDelDia) / MS_POR_MINUTO;

    const franjas = await this.disponibilidad.listar();
    const libreDesde = aInstante(this.libreTrasLaSala(delDia, ahora.minutos, aInstante, aMinutos));

    // Quien avisó que llega tarde no puede atenderse antes de su llegada.
    const pendientes: CitaPendiente[] = evaluadas.map((c) => ({
      citaId: c.id,
      inicioPrevisto: aInstante(horaAMinutos(c.horaInicio) + retrasoAvisado(c)),
      duracionMin: c.duracionMin,
      flexibilidad: retrasoAvisado(c) > 0 ? sinAdelanto(flexibilidadDe(c)) : flexibilidadDe(c),
    }));

    const resultado = proponerAlternativas(pendientes, libreDesde, evento, {
      esHorarioValido: (inicio, fin) =>
        cabeEnHorario(franjas, fecha, aMinutos(inicio), aMinutos(fin)),
    });

    const horaPrevista = new Map(evaluadas.map((c) => [c.id, c.horaInicio]));
    const base: BaseRespuesta = {
      evento,
      fecha,
      citasEvaluadas: evaluadas.length,
      citasNoEvaluadas: reprogramables.length - evaluadas.length,
    };
    const aHora = (instante: Date) => minutosAHora(aMinutos(instante));
    const aAlternativa = (alternativa: Alternativa): AlternativaPropuesta => ({
      asignaciones: alternativa.asignaciones.map((a) => ({
        citaId: a.citaId,
        horaPrevista: horaPrevista.get(a.citaId)!,
        horaPropuesta: aHora(a.inicioPropuesto),
        desplazamientoMin: aMinutos(a.inicioPropuesto) - horaAMinutos(horaPrevista.get(a.citaId)!),
      })),
      desplazamientoTotalMin: alternativa.desplazamientoTotalMin,
      pacientesDesplazados: alternativa.pacientesDesplazados,
    });

    if (resultado.hayAlternativa) {
      return {
        ...base,
        hayAlternativa: true,
        propuesta: aAlternativa(resultado.propuesta),
        otras: resultado.otras.map(aAlternativa),
        explicacion: resultado.explicacion,
      };
    }

    const citasEnConflicto = resultado.citasEnConflicto.map((c) => ({
      citaId: c.citaId,
      horaPrevista: horaPrevista.get(c.citaId)!,
      flexibilidad: c.flexibilidad,
    }));
    await this.alertarAlAdministrador(
      evento,
      citasEnConflicto.map((c) => c.citaId),
    );
    return { ...base, hayAlternativa: false, citasEnConflicto, motivo: resultado.motivo };
  }

  /** Los pacientes que ya están en sala se atienden antes: el odontólogo queda libre después de ellos. */
  private libreTrasLaSala(
    delDia: Cita[],
    ahoraMin: number,
    aInstante: (minutos: number) => Date,
    aMinutos: (instante: Date) => number,
  ): number {
    const libre = odontologoLibreDesde(delDia, ahoraMin);
    const enSala: CitaPendiente[] = delDia
      .filter((c) => c.estado === EstadoCita.EN_SALA)
      .map((c) => ({
        citaId: c.id,
        inicioPrevisto: aInstante(horaAMinutos(c.horaInicio)),
        duracionMin: c.duracionMin,
        flexibilidad: Flexibilidad.PUEDE_ATRASAR,
      }));

    const finales = recalcularHorasEstimadas(enSala, aInstante(libre)).map(
      (e, i) => aMinutos(e.inicioEstimado) + enSala[i].duracionMin,
    );
    return Math.max(libre, ...finales);
  }

  private async alertarAlAdministrador(evento: EventoDisruptivo, citaIds: number[]): Promise<void> {
    await this.notificaciones.save({
      destinatario: 'administrador',
      pacienteId: null,
      citaId: evento.citaId ?? null,
      tipo: 'sin_alternativas',
      destino: 'administrador',
      mensaje:
        `Tras el evento "${evento.tipo}" ninguna combinación respeta las restricciones de los pacientes. ` +
        `Citas en conflicto: ${citaIds.join(', ')}. Decida manualmente cómo reprogramarlas.`,
    });
  }
}

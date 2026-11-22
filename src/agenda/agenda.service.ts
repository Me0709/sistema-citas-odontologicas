import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { OFFSET_CONSULTORIO_MIN } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, fechaValida, horaAMinutos, minutosAHora } from '../comun/tiempo';
import { DisponibilidadService, EspacioAgenda } from '../disponibilidad/disponibilidad.service';
import { retrasoAvisado, sinAdelanto } from '../estimacion/calculo-agenda';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { HoraEstimada, recalcularHorasEstimadas } from '../reordenamiento/dominio/hora-estimada';

export const MENSAJE_SIN_CITAS = 'No hay citas programadas';

/** Citas que todavía no comienzan: su hora de inicio puede cambiar. */
const ESTADOS_PENDIENTES: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.POR_REPROGRAMAR,
  EstadoCita.EN_SALA,
];

export interface CitaDeAgenda {
  id: number;
  paciente: { id: number; nombre: string };
  procedimiento: { id: number; nombre: string };
  horaProgramada: string;
  horaFinProgramada: string;
  duracionMin: number;
  estado: EstadoCita;
  /** Hora de inicio vigente tras recalcular el día; vacía si la cita ya no está pendiente. */
  horaEstimada: string | null;
  /** Minutos entre la hora estimada y la programada; positivo si se atrasa. */
  cambioMin: number | null;
  avisoRetrasoMin: number | null;
  horaLlegada: string | null;
  horaInicioReal: string | null;
  horaFinReal: string | null;
}

export interface AgendaDia {
  fecha: string;
  citas: CitaDeAgenda[];
  mensaje?: string;
  espaciosDisponibles?: EspacioAgenda[];
}

/**
 * Las horas del consultorio se pasan a instantes "de pared" en UTC (la hora local del
 * consultorio escrita como si fuera UTC), para que los cálculos no dependan de la zona
 * horaria del servidor.
 */
const aInstante = (fecha: string, minutos: number): Date => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, 0, minutos));
};

const aHora = (instante: Date): string =>
  minutosAHora(instante.getUTCHours() * 60 + instante.getUTCMinutes());

@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(Cita)
    private readonly repositorio: Repository<Cita>,
    private readonly disponibilidad: DisponibilidadService,
    private readonly flexibilidad: FlexibilidadCitaService,
    private readonly reloj: Reloj,
  ) {}

  async obtener(fecha?: string): Promise<AgendaDia> {
    if (fecha === undefined || !fechaValida(fecha)) {
      throw new BadRequestException(
        'Indique la fecha de la agenda con formato AAAA-MM-DD y que exista en el calendario',
      );
    }

    const citas = await this.repositorio.find({
      where: { fecha },
      relations: { paciente: true, procedimiento: true },
      order: { horaInicio: 'ASC', id: 'ASC' },
    });

    if (citas.length === 0) {
      return {
        fecha,
        citas: [],
        mensaje: MENSAJE_SIN_CITAS,
        espaciosDisponibles: await this.disponibilidad.espacios(fecha, fecha),
      };
    }

    const estimadas = await this.recalcular(fecha, citas);
    return { fecha, citas: citas.map((cita) => this.aCitaDeAgenda(cita, estimadas.get(cita.id))) };
  }

  /**
   * Recalcula con HU-09 la hora de inicio de las citas pendientes del día. El odontólogo queda
   * libre cuando termine la atención en curso o, si no hay ninguna, ahora mismo. Si el día no es
   * hoy no hay nada que recalcular: cada cita conserva su hora programada.
   */
  private async recalcular(fecha: string, citas: Cita[]): Promise<Map<number, HoraEstimada>> {
    const ahora = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN);
    let libreDesde = aInstante(fecha, 0);

    if (ahora.fecha === fecha) {
      libreDesde = aInstante(fecha, ahora.minutos);
      for (const enCurso of citas.filter((c) => c.estado === EstadoCita.EN_ATENCION)) {
        const finEstimado = horaAMinutos(enCurso.horaInicioReal!) + enCurso.duracionMin;
        libreDesde = new Date(
          Math.max(libreDesde.getTime(), aInstante(fecha, finEstimado).getTime()),
        );
      }
    }

    // Sin preferencia declarada (HU-05), el paciente debe mantener su horario.
    const porRecalcular = citas.filter((c) => ESTADOS_PENDIENTES.includes(c.estado));
    const flexibilidades = await this.flexibilidad.porCitas(porRecalcular.map((c) => c.id));
    // Quien avisó que llegará tarde no puede empezar antes de su llegada, y solo cuenta hoy.
    const retraso = (c: Cita): number => (ahora.fecha === fecha ? retrasoAvisado(c) : 0);
    const pendientes = porRecalcular.map((c) => ({
      citaId: c.id,
      inicioPrevisto: aInstante(fecha, horaAMinutos(c.horaInicio) + retraso(c)),
      duracionMin: c.duracionMin,
      flexibilidad:
        retraso(c) > 0 ? sinAdelanto(flexibilidades.get(c.id)!) : flexibilidades.get(c.id)!,
    }));

    return new Map(recalcularHorasEstimadas(pendientes, libreDesde).map((e) => [e.citaId, e]));
  }

  private aCitaDeAgenda(cita: Cita, estimada?: HoraEstimada): CitaDeAgenda {
    return {
      id: cita.id,
      paciente: { id: cita.pacienteId, nombre: cita.paciente!.nombre },
      procedimiento: { id: cita.procedimientoId, nombre: cita.procedimiento!.nombre },
      horaProgramada: cita.horaInicio,
      horaFinProgramada: cita.horaFin,
      duracionMin: cita.duracionMin,
      estado: cita.estado,
      horaEstimada: estimada ? aHora(estimada.inicioEstimado) : null,
      // El cambio se mide contra la hora programada original, no contra la llegada avisada.
      cambioMin: estimada
        ? horaAMinutos(aHora(estimada.inicioEstimado)) - horaAMinutos(cita.horaInicio)
        : null,
      avisoRetrasoMin: cita.avisoRetrasoMin,
      horaLlegada: cita.horaLlegada,
      horaInicioReal: cita.horaInicioReal,
      horaFinReal: cita.horaFinReal,
    };
  }
}

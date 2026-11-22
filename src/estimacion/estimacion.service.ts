import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { LLAVE_BLOQUEO_AGENDA, OFFSET_CONSULTORIO_MIN } from '../comun/constantes';
import { EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { aInstanteLocal, horaAMinutos, minutosAHora } from '../comun/tiempo';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { Paciente } from '../pacientes/paciente.entity';
import { UMBRAL_NOTIFICACION_MIN } from '../reordenamiento/constantes';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { recalcularHorasEstimadas } from '../reordenamiento/dominio/hora-estimada';
import { EstimacionCita } from './estimacion-cita.entity';
import { Notificacion } from './notificacion.entity';

const MS_POR_MINUTO = 60_000;

/**
 * Citas que aún no comienzan: su hora de inicio todavía puede cambiar. "Por reprogramar" sigue
 * ocupando su espacio hasta que se confirme el nuevo horario, así que cuenta en la secuencia.
 */
const ESTADOS_PENDIENTES: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.POR_REPROGRAMAR,
  EstadoCita.EN_SALA,
];

/** Citas que cuentan en el cálculo pero a cuyo paciente no se le avisa ni se alerta al administrador. */
const ESTADOS_SIN_AVISOS: EstadoCita[] = [EstadoCita.EN_SALA, EstadoCita.POR_REPROGRAMAR];

/** Quien avisó que llega tarde no puede adelantarse a antes de su llegada. */
const sinAdelanto = (flexibilidad: Flexibilidad): Flexibilidad =>
  flexibilidad === Flexibilidad.AMBAS
    ? Flexibilidad.PUEDE_ATRASAR
    : flexibilidad === Flexibilidad.PUEDE_ADELANTAR
      ? Flexibilidad.MANTENER
      : flexibilidad;

export interface HoraEstimadaDeCita {
  citaId: number;
  fecha: string;
  horaInicioPrevista: string;
  horaEstimada: string;
  /** Positivo si se retrasa, negativo si se adelanta. */
  cambioMin: number;
  requiereAlternativas: boolean;
}

@Injectable()
export class EstimacionService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reloj: Reloj,
    private readonly flexibilidad: FlexibilidadCitaService,
    private readonly eventos: EventosAgenda,
    @InjectRepository(Cita)
    private readonly citas: Repository<Cita>,
    @InjectRepository(EstimacionCita)
    private readonly estimaciones: Repository<EstimacionCita>,
  ) {}

  onModuleInit(): void {
    this.eventos.suscribir((evento) => this.recalcular(evento.fecha));
  }

  /** Recalcula la hora estimada de las citas pendientes del día y avisa a quien corresponda. */
  async recalcular(fecha: string): Promise<void> {
    const ahora = aInstanteLocal(this.reloj.ahora(), OFFSET_CONSULTORIO_MIN);

    await this.dataSource.transaction(async (manager) => {
      // Misma llave que usan la programación, la llegada y la atención: se calcula sobre una agenda estable.
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);

      const delDia = await manager.find(Cita, { where: { fecha } });
      const pendientes = delDia.filter((c) => ESTADOS_PENDIENTES.includes(c.estado));

      // Una cita que ya no está pendiente (cancelada, atendida, en atención...) no tiene hora estimada.
      const yaNoPendientes = delDia.filter((c) => !ESTADOS_PENDIENTES.includes(c.estado));
      if (yaNoPendientes.length > 0) {
        await manager.delete(EstimacionCita, { citaId: In(yaNoPendientes.map((c) => c.id)) });
      }
      if (pendientes.length === 0) {
        return;
      }

      const idsCitas = pendientes.map((c) => c.id);
      const flexibilidades = await this.flexibilidad.porCitas(idsCitas);
      const previas = new Map(
        (await manager.find(EstimacionCita, { where: { citaId: In(idsCitas) } })).map((e) => [
          e.citaId,
          e,
        ]),
      );
      const pacientes = new Map(
        (
          await manager.find(Paciente, {
            where: { id: In(pendientes.map((c) => c.pacienteId)) },
          })
        ).map((p) => [p.id, p]),
      );

      // El dominio trabaja con instantes; se usa el reloj de pared del consultorio como si fuera UTC.
      const inicioDelDia = Date.parse(`${fecha}T00:00:00Z`);
      const aInstante = (minutos: number) => new Date(inicioDelDia + minutos * MS_POR_MINUTO);

      // Quien avisó que llegará tarde no puede empezar antes de su llegada; el que ya está en sala, sí.
      const retrasoAvisado = (c: Cita): number =>
        c.estado === EstadoCita.EN_SALA ? 0 : (c.avisoRetrasoMin ?? 0);
      const flexibilidadDe = (c: Cita): Flexibilidad =>
        flexibilidades.get(c.id) ?? Flexibilidad.MANTENER;

      const estimadas = recalcularHorasEstimadas(
        pendientes.map((c) => ({
          citaId: c.id,
          inicioPrevisto: aInstante(horaAMinutos(c.horaInicio) + retrasoAvisado(c)),
          duracionMin: c.duracionMin,
          flexibilidad: retrasoAvisado(c) > 0 ? sinAdelanto(flexibilidadDe(c)) : flexibilidadDe(c),
        })),
        aInstante(this.odontologoLibreDesde(delDia, ahora.minutos)),
      );

      const filas: Partial<EstimacionCita>[] = [];
      const avisos: Partial<Notificacion>[] = [];

      for (const estimada of estimadas) {
        const cita = pendientes.find((c) => c.id === estimada.citaId)!;
        const previa = previas.get(cita.id);
        const paciente = pacientes.get(cita.pacienteId);
        const sinAvisos = ESTADOS_SIN_AVISOS.includes(cita.estado);

        const nuevoMin = (estimada.inicioEstimado.getTime() - inicioDelDia) / MS_POR_MINUTO;
        const nuevo = minutosAHora(nuevoMin);
        // El cambio se mide contra la hora programada original, no contra la llegada avisada.
        const cambioMin = nuevoMin - horaAMinutos(cita.horaInicio);

        // Se compara con lo último que se le dijo al paciente, para no repetir avisos casi iguales.
        const referenciaMin = horaAMinutos(previa?.inicioNotificado ?? cita.horaInicio);
        const avisarPaciente =
          !sinAvisos && Math.abs(nuevoMin - referenciaMin) >= UMBRAL_NOTIFICACION_MIN;
        const requiereAlternativas =
          !sinAvisos && cambioMin > 0 && flexibilidadDe(cita) === Flexibilidad.MANTENER;

        if (avisarPaciente) {
          const seRetrasa = nuevoMin > referenciaMin;
          avisos.push({
            destinatario: 'paciente',
            pacienteId: cita.pacienteId,
            citaId: cita.id,
            tipo: seRetrasa ? 'retraso' : 'adelanto',
            destino: paciente
              ? `${paciente.correo} / ${paciente.telefono}`
              : 'sin medio de contacto registrado',
            mensaje: seRetrasa
              ? `Su cita del ${fecha}, prevista a las ${cita.horaInicio}, tiene una nueva hora estimada de inicio: ${nuevo}.`
              : `Hay disponibilidad: puede adelantar su cita del ${fecha}, prevista a las ${cita.horaInicio}. La nueva hora estimada de inicio es ${nuevo}.`,
          });
        }

        if (requiereAlternativas && !previa?.requiereAlternativas) {
          avisos.push({
            destinatario: 'administrador',
            pacienteId: cita.pacienteId,
            citaId: cita.id,
            tipo: 'requiere_alternativas',
            destino: 'administrador',
            mensaje:
              `La cita ${cita.id} (paciente ${cita.pacienteId}) debe mantener su horario de las ${cita.horaInicio} ` +
              `y se retrasa a las ${nuevo} (${cambioMin} min). Evalúe alternativas de reprogramación.`,
          });
        }

        filas.push({
          citaId: cita.id,
          inicioEstimado: nuevo,
          cambioMin,
          inicioNotificado: avisarPaciente ? nuevo : (previa?.inicioNotificado ?? null),
          requiereAlternativas,
        });
      }

      await manager.save(EstimacionCita, filas);
      if (avisos.length > 0) {
        await manager.save(Notificacion, avisos);
      }
    });
  }

  async obtener(citaId: number): Promise<HoraEstimadaDeCita> {
    const cita = await this.citas.findOneBy({ id: citaId });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${citaId}`);
    }
    // Una cita que ya no está pendiente no tiene hora estimada, aunque quede una estimación vieja.
    const estimacion = ESTADOS_PENDIENTES.includes(cita.estado)
      ? await this.estimaciones.findOneBy({ citaId })
      : null;

    return {
      citaId,
      fecha: cita.fecha,
      horaInicioPrevista: cita.horaInicio,
      horaEstimada: estimacion?.inicioEstimado ?? cita.horaInicio,
      cambioMin: estimacion?.cambioMin ?? 0,
      requiereAlternativas: estimacion?.requiereAlternativas ?? false,
    };
  }

  /**
   * Minuto del día desde el que el odontólogo puede atender a la siguiente cita: cuando termine
   * la que está en curso (o termine la última atendida) y nunca antes de ahora.
   */
  private odontologoLibreDesde(citasDelDia: Cita[], ahoraMin: number): number {
    const enAtencion = citasDelDia.filter((c) => c.estado === EstadoCita.EN_ATENCION);
    const terminaLaActual = enAtencion.map((c) => horaAMinutos(c.horaInicioReal!) + c.duracionMin);
    const terminaronAntes = citasDelDia
      .filter((c) => c.estado === EstadoCita.ATENDIDA && c.horaFinReal)
      .map((c) => horaAMinutos(c.horaFinReal!));

    const liberacion = enAtencion.length > 0 ? terminaLaActual : terminaronAntes;
    return Math.max(ahoraMin, ...liberacion);
  }
}

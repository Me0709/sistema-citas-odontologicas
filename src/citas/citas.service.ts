import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import {
  BLOQUE_MINIMO_MIN,
  CANTIDAD_SUGERENCIAS,
  DIAS_BUSQUEDA_SUGERENCIAS,
  LLAVE_BLOQUEO_AGENDA,
} from '../comun/constantes';
import { diaIso, fechaValida, horaAMinutos, minutosAHora, sumarDias } from '../comun/tiempo';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { PacientesService } from '../pacientes/pacientes.service';
import { ProcedimientosService } from '../procedimientos/procedimientos.service';
import { Cita } from './cita.entity';
import { CrearCitaDto } from './dto/crear-cita.dto';
import { ESTADOS_QUE_OCUPAN_AGENDA, EstadoCita } from './estado-cita';

export interface EspacioSugerido {
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

const seCruza = (
  cita: Pick<Cita, 'horaInicio' | 'horaFin'>,
  inicio: number,
  fin: number,
): boolean => horaAMinutos(cita.horaInicio) < fin && inicio < horaAMinutos(cita.horaFin);

@Injectable()
export class CitasService {
  constructor(
    @InjectRepository(Cita)
    private readonly repositorio: Repository<Cita>,
    private readonly dataSource: DataSource,
    private readonly pacientes: PacientesService,
    private readonly procedimientos: ProcedimientosService,
  ) {}

  async crear(dto: CrearCitaDto): Promise<Cita> {
    await this.pacientes.obtener(dto.pacienteId);
    const procedimiento = await this.procedimientos.obtener(dto.procedimientoId);
    if (!procedimiento.activo) {
      throw new BadRequestException('El procedimiento está desactivado y no se puede agendar');
    }

    const inicio = horaAMinutos(dto.horaInicio);
    if (inicio % BLOQUE_MINIMO_MIN !== 0) {
      throw new BadRequestException(
        `La hora de inicio debe ser múltiplo de ${BLOQUE_MINIMO_MIN} minutos`,
      );
    }
    const duracion = procedimiento.duracionMin;
    const fin = inicio + duracion;

    return this.dataSource.transaction(async (manager) => {
      // Un solo odontólogo = una sola agenda: se serializa la creación de citas y el cambio de horario.
      await manager.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);

      // El horario se lee dentro de la transacción y DESPUÉS del bloqueo: si otro cambio de horario
      // estaba en curso, aquí ya se ve el horario confirmado y la cita no se valida contra uno viejo.
      const franjas = await manager.find(FranjaHoraria, {
        order: { diaSemana: 'ASC', horaInicio: 'ASC' },
      });

      const ultimaFecha = sumarDias(dto.fecha, DIAS_BUSQUEDA_SUGERENCIAS - 1);
      const citas = await manager.find(Cita, {
        where: { fecha: Between(dto.fecha, ultimaFecha), estado: In(ESTADOS_QUE_OCUPAN_AGENDA) },
      });
      const citasDelDia = citas.filter((c) => c.fecha === dto.fecha);

      const delPaciente = citasDelDia.find(
        (c) => c.pacienteId === dto.pacienteId && seCruza(c, inicio, fin),
      );
      if (delPaciente) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'El paciente ya tiene una cita que se cruza con el horario elegido',
          citaEnConflicto: {
            id: delPaciente.id,
            fecha: delPaciente.fecha,
            horaInicio: delPaciente.horaInicio,
            horaFin: delPaciente.horaFin,
            estado: delPaciente.estado,
          },
        });
      }

      const dentroDelHorario = this.cabeEnHorario(franjas, dto.fecha, inicio, fin);
      const ocupado = citasDelDia.some((c) => seCruza(c, inicio, fin));
      if (!dentroDelHorario || ocupado) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: dentroDelHorario
            ? 'El horario elegido está ocupado o no alcanza para la duración del procedimiento'
            : 'El horario elegido queda fuera del horario de atención del odontólogo',
          proximosEspacios: this.sugerirEspacios(franjas, citas, dto.fecha, inicio, duracion),
        });
      }

      return manager.save(
        Cita,
        manager.create(Cita, {
          pacienteId: dto.pacienteId,
          procedimientoId: dto.procedimientoId,
          fecha: dto.fecha,
          horaInicio: dto.horaInicio,
          horaFin: minutosAHora(fin),
          duracionMin: duracion,
          estado: EstadoCita.PROGRAMADA,
        }),
      );
    });
  }

  async obtener(id: number): Promise<Cita> {
    const cita = await this.repositorio.findOneBy({ id });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${id}`);
    }
    return cita;
  }

  listar(fecha?: string, pacienteId?: string): Promise<Cita[]> {
    const where: { fecha?: string; pacienteId?: number } = {};

    if (fecha !== undefined) {
      if (!fechaValida(fecha)) {
        throw new BadRequestException('La fecha debe existir y tener formato AAAA-MM-DD');
      }
      where.fecha = fecha;
    }
    if (pacienteId !== undefined) {
      const id = Number(pacienteId);
      if (!Number.isInteger(id) || id < 1) {
        throw new BadRequestException('El paciente debe indicarse con su id numérico');
      }
      where.pacienteId = id;
    }

    return this.repositorio.find({ where, order: { fecha: 'ASC', horaInicio: 'ASC' } });
  }

  private cabeEnHorario(
    franjas: FranjaHoraria[],
    fecha: string,
    inicio: number,
    fin: number,
  ): boolean {
    const dia = diaIso(fecha);
    return franjas.some(
      (f) =>
        f.diaSemana === dia &&
        horaAMinutos(f.horaInicio) <= inicio &&
        fin <= horaAMinutos(f.horaFin),
    );
  }

  private sugerirEspacios(
    franjas: FranjaHoraria[],
    citas: Cita[],
    fecha: string,
    desdeMin: number,
    duracion: number,
  ): EspacioSugerido[] {
    const sugerencias: EspacioSugerido[] = [];

    for (
      let d = 0;
      d < DIAS_BUSQUEDA_SUGERENCIAS && sugerencias.length < CANTIDAD_SUGERENCIAS;
      d++
    ) {
      const dia = sumarDias(fecha, d);
      const ocupadas = citas.filter((c) => c.fecha === dia);

      for (const franja of franjas.filter((f) => f.diaSemana === diaIso(dia))) {
        const finFranja = horaAMinutos(franja.horaFin);
        let m =
          d === 0
            ? Math.max(horaAMinutos(franja.horaInicio), desdeMin)
            : horaAMinutos(franja.horaInicio);

        while (m + duracion <= finFranja && sugerencias.length < CANTIDAD_SUGERENCIAS) {
          if (ocupadas.some((c) => seCruza(c, m, m + duracion))) {
            m += BLOQUE_MINIMO_MIN;
          } else {
            sugerencias.push({
              fecha: dia,
              horaInicio: minutosAHora(m),
              horaFin: minutosAHora(m + duracion),
            });
            m += duracion;
          }
        }
      }
    }
    return sugerencias;
  }
}

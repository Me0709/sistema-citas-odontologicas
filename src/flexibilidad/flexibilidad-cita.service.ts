import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CitasService } from '../citas/citas.service';
import { EstadoCita } from '../citas/estado-cita';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { FlexibilidadCita } from './flexibilidad-cita.entity';

/** Sin preferencia declarada, el paciente debe mantener su horario. */
export const FLEXIBILIDAD_POR_DEFECTO = Flexibilidad.MANTENER;

/** Estados en los que la cita aún no comienza y el paciente puede declarar o cambiar su preferencia. */
export const ESTADOS_QUE_PERMITEN_DECLARAR: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.POR_REPROGRAMAR,
];

export interface FlexibilidadDeCita {
  citaId: number;
  flexibilidad: Flexibilidad;
  /** false cuando el paciente no declaró nada y se aplica la opción por defecto. */
  declarada: boolean;
}

@Injectable()
export class FlexibilidadCitaService {
  constructor(
    @InjectRepository(FlexibilidadCita)
    private readonly repositorio: Repository<FlexibilidadCita>,
    private readonly citas: CitasService,
  ) {}

  async declarar(citaId: number, flexibilidad: Flexibilidad): Promise<FlexibilidadDeCita> {
    const cita = await this.citas.obtener(citaId);
    if (!ESTADOS_QUE_PERMITEN_DECLARAR.includes(cita.estado)) {
      throw new ConflictException(
        `La cita ya no está pendiente (estado "${cita.estado}") y no se puede cambiar su flexibilidad`,
      );
    }

    await this.repositorio.save({ citaId, flexibilidad });
    return { citaId, flexibilidad, declarada: true };
  }

  async obtener(citaId: number): Promise<FlexibilidadDeCita> {
    await this.citas.obtener(citaId);
    const guardada = await this.repositorio.findOneBy({ citaId });
    return guardada
      ? { citaId, flexibilidad: guardada.flexibilidad, declarada: true }
      : { citaId, flexibilidad: FLEXIBILIDAD_POR_DEFECTO, declarada: false };
  }

  /** Flexibilidad de varias citas a la vez; las que no declararon quedan con la opción por defecto. */
  async porCitas(citaIds: number[]): Promise<Map<number, Flexibilidad>> {
    const resultado = new Map<number, Flexibilidad>(
      citaIds.map((id) => [id, FLEXIBILIDAD_POR_DEFECTO]),
    );
    if (citaIds.length === 0) {
      return resultado;
    }

    const guardadas = await this.repositorio.find({ where: { citaId: In(citaIds) } });
    guardadas.forEach((g) => resultado.set(g.citaId, g.flexibilidad));
    return resultado;
  }
}

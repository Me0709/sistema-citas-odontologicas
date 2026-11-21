import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BLOQUE_MINIMO_MIN, MAX_DIAS_CONSULTA_ESPACIOS } from '../comun/constantes';
import {
  diaIso,
  diasEntre,
  fechaValida,
  horaAMinutos,
  minutosAHora,
  sumarDias,
} from '../comun/tiempo';
import { DefinirDisponibilidadDto, FranjaDto } from './dto/definir-disponibilidad.dto';
import { FranjaHoraria } from './franja-horaria.entity';

export interface EspacioAgenda {
  fecha: string;
  inicio: string;
  fin: string;
}

export interface DisponibilidadRespuesta {
  franjas: FranjaHoraria[];
  espaciosPorSemana: number;
}

@Injectable()
export class DisponibilidadService {
  constructor(
    @InjectRepository(FranjaHoraria)
    private readonly repositorio: Repository<FranjaHoraria>,
    private readonly dataSource: DataSource,
  ) {}

  async definir(dto: DefinirDisponibilidadDto): Promise<DisponibilidadRespuesta> {
    this.validarFormato(dto.franjas);
    this.validarConflictos(dto.franjas);

    const guardadas = await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM franjas_horarias');
      return manager.save(
        FranjaHoraria,
        dto.franjas.map((f) => ({
          diaSemana: f.diaSemana,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
        })),
      );
    });

    const franjas = this.ordenar(guardadas);
    return { franjas, espaciosPorSemana: this.contarEspaciosPorSemana(franjas) };
  }

  listar(): Promise<FranjaHoraria[]> {
    return this.repositorio.find({ order: { diaSemana: 'ASC', horaInicio: 'ASC' } });
  }

  async espacios(desde?: string, hasta?: string): Promise<EspacioAgenda[]> {
    if (!desde || !hasta || !fechaValida(desde) || !fechaValida(hasta)) {
      throw new BadRequestException(
        'Indique "desde" y "hasta" como fechas válidas con formato AAAA-MM-DD',
      );
    }
    if (hasta < desde) {
      throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde"');
    }
    const totalDias = diasEntre(desde, hasta) + 1;
    if (totalDias > MAX_DIAS_CONSULTA_ESPACIOS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_DIAS_CONSULTA_ESPACIOS} días`);
    }

    const franjas = await this.listar();
    const espacios: EspacioAgenda[] = [];

    for (let i = 0; i < totalDias; i++) {
      const fecha = sumarDias(desde, i);
      const dia = diaIso(fecha);
      for (const franja of franjas.filter((f) => f.diaSemana === dia)) {
        const fin = horaAMinutos(franja.horaFin);
        for (
          let inicio = horaAMinutos(franja.horaInicio);
          inicio + BLOQUE_MINIMO_MIN <= fin;
          inicio += BLOQUE_MINIMO_MIN
        ) {
          espacios.push({
            fecha,
            inicio: minutosAHora(inicio),
            fin: minutosAHora(inicio + BLOQUE_MINIMO_MIN),
          });
        }
      }
    }
    return espacios;
  }

  private validarFormato(franjas: FranjaDto[]): void {
    const errores: string[] = [];
    for (const franja of franjas) {
      const inicio = horaAMinutos(franja.horaInicio);
      const fin = horaAMinutos(franja.horaFin);
      const etiqueta = `${franja.horaInicio}-${franja.horaFin} (día ${franja.diaSemana})`;
      if (inicio >= fin) {
        errores.push(`La franja ${etiqueta} tiene la hora de inicio igual o posterior a la de fin`);
      } else if (inicio % BLOQUE_MINIMO_MIN !== 0 || fin % BLOQUE_MINIMO_MIN !== 0) {
        errores.push(
          `La franja ${etiqueta} debe empezar y terminar en múltiplos de ${BLOQUE_MINIMO_MIN} minutos`,
        );
      }
    }
    if (errores.length > 0) {
      throw new BadRequestException(errores);
    }
  }

  private validarConflictos(franjas: FranjaDto[]): void {
    const conflictos: { diaSemana: number; franjaA: FranjaResumen; franjaB: FranjaResumen }[] = [];

    for (let i = 0; i < franjas.length; i++) {
      for (let j = i + 1; j < franjas.length; j++) {
        const a = franjas[i];
        const b = franjas[j];
        const seCruzan =
          a.diaSemana === b.diaSemana &&
          horaAMinutos(a.horaInicio) < horaAMinutos(b.horaFin) &&
          horaAMinutos(b.horaInicio) < horaAMinutos(a.horaFin);
        if (seCruzan) {
          conflictos.push({
            diaSemana: a.diaSemana,
            franjaA: { horaInicio: a.horaInicio, horaFin: a.horaFin },
            franjaB: { horaInicio: b.horaInicio, horaFin: b.horaFin },
          });
        }
      }
    }

    if (conflictos.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Hay franjas del mismo día que se superponen',
        conflictos,
      });
    }
  }

  private ordenar(franjas: FranjaHoraria[]): FranjaHoraria[] {
    return [...franjas].sort(
      (a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio),
    );
  }

  private contarEspaciosPorSemana(franjas: FranjaHoraria[]): number {
    return franjas.reduce(
      (total, f) =>
        total + (horaAMinutos(f.horaFin) - horaAMinutos(f.horaInicio)) / BLOQUE_MINIMO_MIN,
      0,
    );
  }
}

interface FranjaResumen {
  horaInicio: string;
  horaFin: string;
}

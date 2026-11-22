import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { Paciente } from './paciente.entity';

export interface HistorialCita {
  id: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  estado: EstadoCita;
  procedimiento: { id: number; nombre: string } | null;
}

export type PacienteRespuesta = Paciente & { historialCitas: HistorialCita[] };

const CODIGO_UNICIDAD_POSTGRES = '23505';

const aHistorial = (cita: Cita): HistorialCita => ({
  id: cita.id,
  fecha: cita.fecha,
  horaInicio: cita.horaInicio,
  horaFin: cita.horaFin,
  duracionMin: cita.duracionMin,
  estado: cita.estado,
  procedimiento: cita.procedimiento
    ? { id: cita.procedimiento.id, nombre: cita.procedimiento.nombre }
    : null,
});

@Injectable()
export class PacientesService {
  constructor(
    @InjectRepository(Paciente)
    private readonly repositorio: Repository<Paciente>,
    @InjectRepository(Cita)
    private readonly citas: Repository<Cita>,
  ) {}

  async crear(dto: CrearPacienteDto): Promise<PacienteRespuesta> {
    const existente = await this.repositorio.findOneBy({ documento: dto.documento });
    if (existente) {
      throw this.errorDocumentoDuplicado(dto.documento);
    }

    try {
      const guardado = await this.repositorio.save(this.repositorio.create({ ...dto }));
      // Un paciente recién creado todavía no tiene citas.
      return { ...guardado, historialCitas: [] };
    } catch (error) {
      const codigo = (error as { driverError?: { code?: string } }).driverError?.code;
      if (codigo === CODIGO_UNICIDAD_POSTGRES) {
        throw this.errorDocumentoDuplicado(dto.documento);
      }
      throw error;
    }
  }

  async listar(): Promise<PacienteRespuesta[]> {
    const pacientes = await this.repositorio.find({ order: { nombre: 'ASC' } });
    if (pacientes.length === 0) {
      return [];
    }

    const citas = await this.citas.find({
      where: { pacienteId: In(pacientes.map((p) => p.id)) },
      relations: { procedimiento: true },
      order: { fecha: 'DESC', horaInicio: 'DESC' },
    });

    return pacientes.map((paciente) => ({
      ...paciente,
      historialCitas: citas.filter((c) => c.pacienteId === paciente.id).map(aHistorial),
    }));
  }

  async obtener(id: number): Promise<PacienteRespuesta> {
    const paciente = await this.repositorio.findOneBy({ id });
    if (!paciente) {
      throw new NotFoundException(`No existe el paciente ${id}`);
    }

    const citas = await this.citas.find({
      where: { pacienteId: id },
      relations: { procedimiento: true },
      order: { fecha: 'DESC', horaInicio: 'DESC' },
    });
    return { ...paciente, historialCitas: citas.map(aHistorial) };
  }

  async existe(id: number): Promise<void> {
    const existe = await this.repositorio.existsBy({ id });
    if (!existe) {
      throw new NotFoundException(`No existe el paciente ${id}`);
    }
  }

  private errorDocumentoDuplicado(documento: string): ConflictException {
    return new ConflictException(
      `El paciente ya existe: hay un registro con el documento ${documento}`,
    );
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrearPacienteDto } from './dto/crear-paciente.dto';
import { Paciente } from './paciente.entity';

export type PacienteRespuesta = Paciente & { historialCitas: never[] };

const CODIGO_UNICIDAD_POSTGRES = '23505';

@Injectable()
export class PacientesService {
  constructor(
    @InjectRepository(Paciente)
    private readonly repositorio: Repository<Paciente>,
  ) {}

  async crear(dto: CrearPacienteDto): Promise<PacienteRespuesta> {
    const existente = await this.repositorio.findOneBy({ documento: dto.documento });
    if (existente) {
      throw this.errorDocumentoDuplicado(dto.documento);
    }

    try {
      const guardado = await this.repositorio.save(this.repositorio.create({ ...dto }));
      return this.aRespuesta(guardado);
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
    return pacientes.map((paciente) => this.aRespuesta(paciente));
  }

  async obtener(id: number): Promise<PacienteRespuesta> {
    const paciente = await this.repositorio.findOneBy({ id });
    if (!paciente) {
      throw new NotFoundException(`No existe el paciente ${id}`);
    }
    return this.aRespuesta(paciente);
  }

  private errorDocumentoDuplicado(documento: string): ConflictException {
    return new ConflictException(
      `El paciente ya existe: hay un registro con el documento ${documento}`,
    );
  }

  // Provisional: en HU-04 el historial saldrá de la relación con las citas.
  private aRespuesta(paciente: Paciente): PacienteRespuesta {
    return { ...paciente, historialCitas: [] };
  }
}

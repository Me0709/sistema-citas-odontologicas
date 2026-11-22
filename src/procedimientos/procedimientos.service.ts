import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActualizarProcedimientoDto } from './dto/actualizar-procedimiento.dto';
import { CrearProcedimientoDto } from './dto/crear-procedimiento.dto';
import { Procedimiento } from './procedimiento.entity';

@Injectable()
export class ProcedimientosService {
  constructor(
    @InjectRepository(Procedimiento)
    private readonly repositorio: Repository<Procedimiento>,
  ) {}

  crear(dto: CrearProcedimientoDto): Promise<Procedimiento> {
    return this.repositorio.save(
      this.repositorio.create({ nombre: dto.nombre, duracionMin: dto.duracionMin }),
    );
  }

  listar(incluirInactivos = false): Promise<Procedimiento[]> {
    return this.repositorio.find({
      where: incluirInactivos ? {} : { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async obtener(id: number): Promise<Procedimiento> {
    const procedimiento = await this.repositorio.findOneBy({ id });
    if (!procedimiento) {
      throw new NotFoundException(`No existe el procedimiento ${id}`);
    }
    return procedimiento;
  }

  async actualizar(
    id: number,
    dto: ActualizarProcedimientoDto,
  ): Promise<{ procedimiento: Procedimiento; aviso?: string }> {
    const procedimiento = await this.obtener(id);
    const cambioDuracion =
      dto.duracionMin !== undefined && dto.duracionMin !== procedimiento.duracionMin;

    if (dto.nombre !== undefined) procedimiento.nombre = dto.nombre;
    if (dto.duracionMin !== undefined) procedimiento.duracionMin = dto.duracionMin;

    await this.repositorio.save(procedimiento);
    return {
      procedimiento,
      aviso: cambioDuracion
        ? 'La nueva duración se aplica solo a las citas nuevas; las citas ya programadas conservan su duración.'
        : undefined,
    };
  }

  async desactivar(id: number): Promise<Procedimiento> {
    const procedimiento = await this.obtener(id);
    procedimiento.activo = false;
    return this.repositorio.save(procedimiento);
  }
}

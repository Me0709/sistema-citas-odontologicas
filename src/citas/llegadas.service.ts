import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TIEMPO_MAXIMO_ESPERA_MIN, TOLERANCIA_PUNTUALIDAD_MIN } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { horaAMinutos } from '../comun/tiempo';
import { Cita } from './cita.entity';
import { RegistrarLlegadaDto } from './dto/registrar-llegada.dto';
import { EstadoCita } from './estado-cita';

const ESTADOS_QUE_ADMITEN_LLEGADA: EstadoCita[] = [EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA];

const dosDigitos = (n: number): string => n.toString().padStart(2, '0');
const fechaLocal = (d: Date): string =>
  `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
const horaLocal = (d: Date): string => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

@Injectable()
export class LlegadasService {
  constructor(
    @InjectRepository(Cita)
    private readonly repositorio: Repository<Cita>,
    private readonly reloj: Reloj,
  ) {}

  async registrar(id: number, dto: RegistrarLlegadaDto): Promise<Cita> {
    const cita = await this.repositorio.findOneBy({ id });
    if (!cita) {
      throw new NotFoundException(`No existe la cita ${id}`);
    }

    if (cita.estado === EstadoCita.INASISTENCIA) {
      throw this.errorInasistencia('La cita ya figura como inasistencia', cita);
    }
    if (!ESTADOS_QUE_ADMITEN_LLEGADA.includes(cita.estado)) {
      throw new ConflictException(
        `No se puede registrar la llegada de una cita en estado "${cita.estado}"`,
      );
    }

    const horaLlegada = dto.horaLlegada ?? this.horaActual(cita);
    const diferencia = horaAMinutos(horaLlegada) - horaAMinutos(cita.horaInicio);

    if (diferencia > TIEMPO_MAXIMO_ESPERA_MIN) {
      throw this.errorInasistencia(
        `El paciente superó el tiempo máximo de espera de ${TIEMPO_MAXIMO_ESPERA_MIN} minutos; la cita debe registrarse como inasistencia`,
        cita,
      );
    }

    cita.horaLlegada = horaLlegada;
    cita.minutosRetraso = diferencia > TOLERANCIA_PUNTUALIDAD_MIN ? diferencia : 0;
    cita.estado = EstadoCita.EN_SALA;
    return this.repositorio.save(cita);
  }

  /** Sin hora indicada se usa el reloj, y la cita tiene que ser de hoy. */
  private horaActual(cita: Cita): string {
    const ahora = this.reloj.ahora();
    if (fechaLocal(ahora) !== cita.fecha) {
      throw new ConflictException(
        `La cita es del ${cita.fecha}; indique la hora de llegada para registrarla`,
      );
    }
    return horaLocal(ahora);
  }

  private errorInasistencia(mensaje: string, cita: Cita): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: mensaje,
      ofreceReprogramar: true,
      cita: { id: cita.id, fecha: cita.fecha, horaInicio: cita.horaInicio, estado: cita.estado },
    });
  }
}

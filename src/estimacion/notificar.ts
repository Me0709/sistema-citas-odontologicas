import { EntityManager } from 'typeorm';
import { Paciente } from '../pacientes/paciente.entity';
import { Notificacion, TipoNotificacion } from './notificacion.entity';

interface DatosDelAviso {
  pacienteId: number | null;
  citaId: number | null;
  tipo: TipoNotificacion;
  mensaje: string;
}

/**
 * Registra un aviso para el paciente, por su medio de contacto registrado. Usa el mismo
 * manager de quien lo pide, de modo que el aviso y el hecho que lo origina se confirman juntos.
 */
export async function notificarAlPaciente(
  manager: EntityManager,
  datos: DatosDelAviso & { pacienteId: number },
): Promise<void> {
  const paciente = await manager.findOneBy(Paciente, { id: datos.pacienteId });
  await manager.save(Notificacion, {
    destinatario: 'paciente',
    pacienteId: datos.pacienteId,
    citaId: datos.citaId,
    tipo: datos.tipo,
    destino: paciente
      ? `${paciente.correo} / ${paciente.telefono}`
      : 'sin medio de contacto registrado',
    mensaje: datos.mensaje,
  });
}

/** Registra una alerta para el administrador del consultorio. */
export async function notificarAlAdministrador(
  manager: EntityManager,
  datos: DatosDelAviso,
): Promise<void> {
  await manager.save(Notificacion, {
    destinatario: 'administrador',
    pacienteId: datos.pacienteId,
    citaId: datos.citaId,
    tipo: datos.tipo,
    destino: 'administrador',
    mensaje: datos.mensaje,
  });
}

import { Paciente } from '../pacientes/paciente.entity';
import { Notificacion } from './notificacion.entity';
import { notificarAlAdministrador, notificarAlPaciente } from './notificar';

describe('notificar', () => {
  const manager = { findOneBy: jest.fn(), save: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    manager.save.mockImplementation((_entidad: unknown, datos: unknown) => Promise.resolve(datos));
  });

  describe('notificarAlPaciente', () => {
    it('registra el aviso con el correo y el teléfono registrados del paciente', async () => {
      manager.findOneBy.mockResolvedValue({
        id: 7,
        correo: 'ana@correo.com',
        telefono: '3001234567',
      });

      await notificarAlPaciente(manager as never, {
        pacienteId: 7,
        citaId: 5,
        tipo: 'cita_cancelada',
        mensaje: 'Su cita fue cancelada.',
      });

      expect(manager.findOneBy).toHaveBeenCalledWith(Paciente, { id: 7 });
      expect(manager.save).toHaveBeenCalledWith(Notificacion, {
        destinatario: 'paciente',
        pacienteId: 7,
        citaId: 5,
        tipo: 'cita_cancelada',
        destino: 'ana@correo.com / 3001234567',
        mensaje: 'Su cita fue cancelada.',
      });
    });

    it('si el paciente no tiene medio de contacto, lo deja indicado', async () => {
      manager.findOneBy.mockResolvedValue(null);

      await notificarAlPaciente(manager as never, {
        pacienteId: 7,
        citaId: 5,
        tipo: 'cita_cancelada',
        mensaje: 'Aviso',
      });

      expect(manager.save).toHaveBeenCalledWith(
        Notificacion,
        expect.objectContaining({ destino: 'sin medio de contacto registrado' }),
      );
    });
  });

  describe('notificarAlAdministrador', () => {
    it('registra la alerta para el administrador con la cita y el paciente', async () => {
      await notificarAlAdministrador(manager as never, {
        pacienteId: 7,
        citaId: 5,
        tipo: 'propuesta_rechazada',
        mensaje: 'Rechazó la propuesta.',
      });

      expect(manager.findOneBy).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(Notificacion, {
        destinatario: 'administrador',
        pacienteId: 7,
        citaId: 5,
        tipo: 'propuesta_rechazada',
        destino: 'administrador',
        mensaje: 'Rechazó la propuesta.',
      });
    });
  });
});

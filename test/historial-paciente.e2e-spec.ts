import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

interface CitaHistorial {
  id: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  estado: string;
  procedimiento: { id: number; nombre: string } | null;
}

describe('HU-02 Historial de citas del paciente', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  const LUNES = '2026-11-23';

  const api = () => request(app.getHttpServer());

  const crearProcedimiento = async (nombre: string, duracionMin = 30): Promise<number> => {
    const { body } = await api().post('/procedimientos').send({ nombre, duracionMin }).expect(201);
    return body.id as number;
  };

  const crearPaciente = async (): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/pacientes')
      .send({
        nombre: `Paciente ${contador}`,
        documento: String(3000000000 + contador),
        telefono: '3001234567',
        correo: `paciente${contador}@correo.com`,
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    return body.id as number;
  };

  const programar = async (
    pacienteId: number,
    procedimientoId: number,
    horaInicio: string,
  ): Promise<{ id: number }> => {
    const { body } = await api()
      .post('/citas')
      .send({ pacienteId, procedimientoId, fecha: LUNES, horaInicio })
      .expect(201);
    return body as { id: number };
  };

  const historialDe = async (pacienteId: number): Promise<CitaHistorial[]> => {
    const { body } = await api().get(`/pacientes/${pacienteId}`).expect(200);
    return body.historialCitas as CitaHistorial[];
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await api()
      .put('/disponibilidad')
      .send({
        franjas: [
          { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
          { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('un paciente sin citas tiene el historial vacío', async () => {
    const pacienteId = await crearPaciente();
    expect(await historialDe(pacienteId)).toEqual([]);
  });

  it('muestra sus citas con el procedimiento, la más reciente primero, sin mezclar las de otros pacientes', async () => {
    const procedimientoId = await crearProcedimiento('Limpieza dental', 30);
    const pacienteA = await crearPaciente();
    const pacienteB = await crearPaciente();
    const manana = await programar(pacienteA, procedimientoId, '09:00');
    const tarde = await programar(pacienteA, procedimientoId, '15:00');
    await programar(pacienteB, procedimientoId, '10:00');

    const historialA = await historialDe(pacienteA);

    expect(historialA).toHaveLength(2);
    expect(historialA[0]).toMatchObject({
      id: tarde.id,
      fecha: LUNES,
      horaInicio: '15:00',
      horaFin: '15:30',
      duracionMin: 30,
      estado: 'Programada',
      procedimiento: { id: procedimientoId, nombre: 'Limpieza dental' },
    });
    expect(historialA[1].id).toBe(manana.id);
    expect(await historialDe(pacienteB)).toHaveLength(1);
  });

  it('incluye las citas en cualquier estado, también canceladas y atendidas', async () => {
    const procedimientoId = await crearProcedimiento('Endodoncia', 30);
    const pacienteId = await crearPaciente();
    const cancelada = await programar(pacienteId, procedimientoId, '09:00');
    const atendida = await programar(pacienteId, procedimientoId, '10:00');
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', [
      'Cancelada',
      cancelada.id,
    ]);
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', ['Atendida', atendida.id]);

    const historial = await historialDe(pacienteId);

    expect(historial.map((c) => c.estado)).toEqual(['Atendida', 'Cancelada']);
  });

  it('el listado de pacientes trae el historial de cada uno', async () => {
    const procedimientoId = await crearProcedimiento('Limpieza dental', 30);
    const conCitas = await crearPaciente();
    const sinCitas = await crearPaciente();
    await programar(conCitas, procedimientoId, '09:00');

    const { body } = await api().get('/pacientes').expect(200);
    const lista = body as { id: number; historialCitas: CitaHistorial[] }[];

    expect(lista.find((p) => p.id === conCitas)?.historialCitas).toHaveLength(1);
    expect(lista.find((p) => p.id === sinCitas)?.historialCitas).toEqual([]);
  });
});

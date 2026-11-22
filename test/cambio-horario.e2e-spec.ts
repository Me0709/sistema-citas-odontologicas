import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-03 Escenario 3: cambio de horario con citas programadas', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // Reloj fijo: las pruebas no dependen de la fecha real. Por defecto es anterior a todas las citas.
  const AHORA_BASE = new Date('2026-11-20T15:00:00Z');
  let ahora = AHORA_BASE;

  // El 2026-11-23 es lunes y el 2026-11-24 es martes.
  const LUNES = '2026-11-23';
  const MARTES = '2026-11-24';
  const HORARIO_ORIGINAL = [
    { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
    { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
    { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' },
  ];

  const api = () => request(app.getHttpServer());
  const definir = (franjas: object[]) => api().put('/disponibilidad').send({ franjas });

  const crearProcedimiento = async (duracionMin = 30): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/procedimientos')
      .send({ nombre: `Procedimiento ${contador}`, duracionMin })
      .expect(201);
    return body.id as number;
  };

  const crearPaciente = async (): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/pacientes')
      .send({
        nombre: `Paciente ${contador}`,
        documento: String(2000000000 + contador),
        telefono: '3001234567',
        correo: `paciente${contador}@correo.com`,
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    return body.id as number;
  };

  const programar = async (
    procedimientoId: number,
    fecha: string,
    horaInicio: string,
  ): Promise<{ id: number }> => {
    const pacienteId = await crearPaciente();
    const { body } = await api()
      .post('/citas')
      .send({ pacienteId, procedimientoId, fecha, horaInicio })
      .expect(201);
    return body as { id: number };
  };

  const estadoDe = async (id: number): Promise<string> => {
    const { body } = await api().get(`/citas/${id}`).expect(200);
    return body.estado as string;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => ahora })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    ahora = AHORA_BASE;
    await dataSource.query(
      'TRUNCATE TABLE citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await definir(HORARIO_ORIGINAL).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('muestra las citas afectadas y las pasa a "Por reprogramar"', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const dentro = await programar(procedimientoId, LUNES, '09:00');
    const fuera = await programar(procedimientoId, LUNES, '15:00');

    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas).toHaveLength(1);
    expect(respuesta.body.citasAfectadas[0]).toMatchObject({
      id: fuera.id,
      fecha: LUNES,
      horaInicio: '15:00',
      horaFin: '15:30',
      estadoAnterior: 'Programada',
      estado: 'Por reprogramar',
    });
    expect(await estadoDe(fuera.id)).toBe('Por reprogramar');
    expect(await estadoDe(dentro.id)).toBe('Programada');
  });

  it('una cita que empieza dentro de la jornada pero termina fuera también queda afectada', async () => {
    const procedimientoId = await crearProcedimiento(60);
    const cita = await programar(procedimientoId, LUNES, '10:30'); // 10:30 a 11:30

    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '11:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas.map((c: { id: number }) => c.id)).toEqual([cita.id]);
    expect(await estadoDe(cita.id)).toBe('Por reprogramar');
  });

  it('un día que ya no tiene atención afecta todas sus citas, ordenadas por fecha y hora', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const martes = await programar(procedimientoId, MARTES, '09:00');
    const lunesTarde = await programar(procedimientoId, LUNES, '15:00');
    const lunesManana = await programar(procedimientoId, LUNES, '09:00');

    // El nuevo horario solo atiende los miércoles.
    const respuesta = await definir([
      { diaSemana: 3, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas.map((c: { id: number }) => c.id)).toEqual([
      lunesManana.id,
      lunesTarde.id,
      martes.id,
    ]);
  });

  it('informa el estado anterior cuando la cita estaba "Confirmada"', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const cita = await programar(procedimientoId, LUNES, '15:00');
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', ['Confirmada', cita.id]);

    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas[0]).toMatchObject({
      id: cita.id,
      estadoAnterior: 'Confirmada',
    });
  });

  it('no toca las citas canceladas, atendidas ni las que ya estaban por reprogramar', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const cancelada = await programar(procedimientoId, LUNES, '15:00');
    const atendida = await programar(procedimientoId, LUNES, '15:30');
    const yaPorReprogramar = await programar(procedimientoId, LUNES, '16:00');
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', [
      'Cancelada',
      cancelada.id,
    ]);
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', ['Atendida', atendida.id]);
    await dataSource.query('UPDATE citas SET estado = $1 WHERE id = $2', [
      'Por reprogramar',
      yaPorReprogramar.id,
    ]);

    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas).toEqual([]);
    expect(await estadoDe(cancelada.id)).toBe('Cancelada');
    expect(await estadoDe(atendida.id)).toBe('Atendida');
    expect(await estadoDe(yaPorReprogramar.id)).toBe('Por reprogramar');
  });

  it('no toca las citas que ya empezaron: solo las posteriores a ahora', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const yaEmpezo = await programar(procedimientoId, LUNES, '09:00');
    const porVenir = await programar(procedimientoId, LUNES, '15:00');

    ahora = new Date('2026-11-23T15:00:00Z'); // lunes 10:00 en Colombia

    const respuesta = await definir([
      { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas.map((c: { id: number }) => c.id)).toEqual([porVenir.id]);
    expect(await estadoDe(yaEmpezo.id)).toBe('Programada');
    expect(await estadoDe(porVenir.id)).toBe('Por reprogramar');
  });

  it('si todas las citas siguen cabiendo, no hay citas afectadas', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const cita = await programar(procedimientoId, LUNES, '09:00');

    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '07:00', horaFin: '13:00' },
    ]).expect(200);

    expect(respuesta.body.citasAfectadas).toEqual([]);
    expect(await estadoDe(cita.id)).toBe('Programada');
  });

  it('si el nuevo horario se rechaza, ninguna cita cambia de estado', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const cita = await programar(procedimientoId, LUNES, '15:00');

    await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
      { diaSemana: 1, horaInicio: '11:00', horaFin: '14:00' },
    ]).expect(400);

    expect(await estadoDe(cita.id)).toBe('Programada');
  });
});

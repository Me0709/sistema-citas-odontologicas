import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { LLAVE_BLOQUEO_AGENDA } from '../src/comun/constantes';

describe('Programar una cita mientras cambia el horario', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes.
  const LUNES = '2026-11-23';

  const api = () => request(app.getHttpServer());

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
        documento: String(4000000000 + contador),
        telefono: '3001234567',
        correo: `paciente${contador}@correo.com`,
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    return body.id as number;
  };

  // Espera, sin depender de tiempos fijos, a que alguna sesión quede detenida en el bloqueo de la agenda.
  const esperarQueLaCitaEsperaElBloqueo = async (): Promise<void> => {
    for (let intento = 0; intento < 50; intento++) {
      const filas = (await dataSource.query(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
      )) as { n: number }[];
      if (filas[0].n > 0) {
        return;
      }
      await new Promise((resolver) => setTimeout(resolver, 100));
    }
    throw new Error('La solicitud de la cita no llegó a esperar el bloqueo de la agenda');
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

  it('una cita que espera el bloqueo se valida contra el horario vigente al obtenerlo, no contra el anterior', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);

    // Simula un cambio de horario en curso: otra transacción tiene el bloqueo de la agenda.
    const sesion = dataSource.createQueryRunner();
    await sesion.connect();
    await sesion.startTransaction();

    try {
      await sesion.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_AGENDA]);

      // La cita se pide para la mañana, que todavía existe en el horario guardado.
      const intento = api()
        .post('/citas')
        .send({ pacienteId, procedimientoId, fecha: LUNES, horaInicio: '09:00' })
        .then((respuesta) => respuesta);
      await esperarQueLaCitaEsperaElBloqueo();

      // Mientras la cita espera, el horario cambia: ya no hay atención por la mañana.
      await sesion.query('DELETE FROM franjas_horarias');
      await sesion.query(
        `INSERT INTO franjas_horarias (dia_semana, hora_inicio, hora_fin) VALUES (1, '14:00', '18:00')`,
      );
      await sesion.commitTransaction();

      const respuesta = await intento;

      expect(respuesta.status).toBe(409);
      expect(String(respuesta.body.message)).toContain('horario de atención');
      expect(respuesta.body.proximosEspacios[0]).toEqual({
        fecha: LUNES,
        horaInicio: '14:00',
        horaFin: '14:30',
      });
      expect((await api().get('/citas').expect(200)).body).toHaveLength(0);
    } catch (error) {
      if (sesion.isTransactionActive) {
        await sesion.rollbackTransaction();
      }
      throw error;
    } finally {
      await sesion.release();
    }
  });
});

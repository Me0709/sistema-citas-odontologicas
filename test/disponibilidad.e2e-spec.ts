import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('HU-03 Disponibilidad del odontólogo', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const definir = (franjas: object[]) =>
    request(app.getHttpServer()).put('/disponibilidad').send({ franjas });
  const obtener = () => request(app.getHttpServer()).get('/disponibilidad').expect(200);
  const espacios = (desde: string, hasta: string) =>
    request(app.getHttpServer()).get(`/disponibilidad/espacios?desde=${desde}&hasta=${hasta}`);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE franjas_horarias RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Escenario 1: guarda el horario semanal y genera los espacios de las semanas siguientes', async () => {
    // El 2026-11-23 es lunes.
    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
      { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
      { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' },
    ]).expect(200);

    expect(respuesta.body.franjas).toHaveLength(3);
    expect(respuesta.body.espaciosPorSemana).toBe(48);
    expect((await obtener()).body).toHaveLength(3);

    const semana1 = await espacios('2026-11-23', '2026-11-29').expect(200);
    expect(semana1.body).toHaveLength(48);
    expect(semana1.body[0]).toEqual({ fecha: '2026-11-23', inicio: '08:00', fin: '08:15' });

    const dosSemanas = await espacios('2026-11-23', '2026-12-06').expect(200);
    expect(dosSemanas.body).toHaveLength(96);
  });

  it('un nuevo horario reemplaza al anterior', async () => {
    await definir([{ diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }]).expect(200);
    await definir([{ diaSemana: 3, horaInicio: '09:00', horaFin: '11:00' }]).expect(200);

    const horario = (await obtener()).body;
    expect(horario).toHaveLength(1);
    expect(horario[0].diaSemana).toBe(3);
  });

  it('Escenario 2: rechaza franjas que se cruzan e indica cuáles y no guarda nada', async () => {
    const respuesta = await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
      { diaSemana: 1, horaInicio: '11:00', horaFin: '14:00' },
    ]).expect(400);

    expect(String(respuesta.body.message)).toContain('superponen');
    expect(respuesta.body.conflictos).toHaveLength(1);
    expect(respuesta.body.conflictos[0].diaSemana).toBe(1);
    expect((await obtener()).body).toHaveLength(0);
  });

  it('acepta franjas del mismo día que solo se tocan', async () => {
    await definir([
      { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
      { diaSemana: 1, horaInicio: '12:00', horaFin: '14:00' },
    ]).expect(200);
  });

  it('rechaza una franja con el inicio igual o posterior al fin', async () => {
    await definir([{ diaSemana: 1, horaInicio: '12:00', horaFin: '08:00' }]).expect(400);
  });

  it('rechaza horas que no son múltiplos de 15 minutos', async () => {
    await definir([{ diaSemana: 1, horaInicio: '08:10', horaFin: '12:00' }]).expect(400);
  });

  it('rechaza datos con formato inválido', async () => {
    await definir([{ diaSemana: 8, horaInicio: '8:00', horaFin: '25:00' }]).expect(400);
    await definir([]).expect(400);
  });

  it('valida el rango de fechas al consultar los espacios', async () => {
    await espacios('2026-11-23', '2026-11-20').expect(400);
    await espacios('2026-11-23', '2027-03-01').expect(400);
    await espacios('hoy', '2026-11-29').expect(400);
    await request(app.getHttpServer()).get('/disponibilidad/espacios').expect(400);
  });
});

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('franjas_horarias')
export class FranjaHoraria {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 1 = lunes ... 7 = domingo */
  @Column({ name: 'dia_semana', type: 'int' })
  diaSemana!: number;

  @Column({ name: 'hora_inicio', type: 'varchar', length: 5 })
  horaInicio!: string;

  @Column({ name: 'hora_fin', type: 'varchar', length: 5 })
  horaFin!: string;
}

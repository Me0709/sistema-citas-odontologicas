import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('procedimientos')
export class Procedimiento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ name: 'duracion_min', type: 'int' })
  duracionMin!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pacientes')
export class Paciente {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  documento!: string;

  @Column({ type: 'varchar', length: 20 })
  telefono!: string;

  @Column({ type: 'varchar', length: 150 })
  correo!: string;

  @Column({ name: 'autoriza_tratamiento_datos', type: 'boolean' })
  autorizaTratamientoDatos!: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

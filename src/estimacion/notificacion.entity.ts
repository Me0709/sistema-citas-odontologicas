import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type DestinatarioNotificacion = 'paciente' | 'administrador';
export type TipoNotificacion = 'retraso' | 'adelanto' | 'requiere_alternativas';

/**
 * Aviso generado por el sistema. Queda registrado con su destino y su mensaje; todavía no hay
 * un proveedor real de correo o SMS conectado.
 */
@Entity('notificaciones')
export class Notificacion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 15 })
  destinatario!: DestinatarioNotificacion;

  @Column({ name: 'paciente_id', type: 'int', nullable: true })
  pacienteId!: number | null;

  @Column({ name: 'cita_id', type: 'int', nullable: true })
  citaId!: number | null;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoNotificacion;

  /** Medio de contacto registrado del paciente, o "administrador". */
  @Column({ type: 'varchar', length: 200 })
  destino!: string;

  @Column({ type: 'text' })
  mensaje!: string;

  @CreateDateColumn({ name: 'creada_en' })
  creadaEn!: Date;
}

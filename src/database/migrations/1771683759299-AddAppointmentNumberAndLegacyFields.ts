import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAppointmentNumberAndLegacyFields1771683759299 implements MigrationInterface {
    name = 'AddAppointmentNumberAndLegacyFields1771683759299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointments" ADD "appointmentNumber" BIGSERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "UQ_dc42b126dbf1ec5310d769e1b27" UNIQUE ("appointmentNumber")`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "expiresAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "legacyTurnoId" bigint`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "legacyPlant" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP CONSTRAINT "FK_6da9eda7139d05b8797ddc45698"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP CONSTRAINT "UQ_6da9eda7139d05b8797ddc45698"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP COLUMN "appointmentId"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD "appointmentId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD CONSTRAINT "UQ_6da9eda7139d05b8797ddc45698" UNIQUE ("appointmentId")`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_90213a20c94916e46cd2131364f"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "appointmentId"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "appointmentId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD CONSTRAINT "FK_6da9eda7139d05b8797ddc45698" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_90213a20c94916e46cd2131364f" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_90213a20c94916e46cd2131364f"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP CONSTRAINT "FK_6da9eda7139d05b8797ddc45698"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "appointmentId"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "appointmentId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_90213a20c94916e46cd2131364f" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP CONSTRAINT "UQ_6da9eda7139d05b8797ddc45698"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" DROP COLUMN "appointmentId"`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD "appointmentId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD CONSTRAINT "UQ_6da9eda7139d05b8797ddc45698" UNIQUE ("appointmentId")`);
        await queryRunner.query(`ALTER TABLE "appointment_details" ADD CONSTRAINT "FK_6da9eda7139d05b8797ddc45698" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "legacyPlant"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "legacyTurnoId"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "expiresAt"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "UQ_dc42b126dbf1ec5310d769e1b27"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "appointmentNumber"`);
    }

}

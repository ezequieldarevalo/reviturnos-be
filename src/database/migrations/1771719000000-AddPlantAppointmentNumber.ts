import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlantAppointmentNumber1771719000000 implements MigrationInterface {
  name = 'AddPlantAppointmentNumber1771719000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" ADD "plantAppointmentNumber" bigint`);

    // Backfill: numeración por planta desde 0 (cero)
    await queryRunner.query(`
      WITH numbered AS (
        SELECT
          id,
          (ROW_NUMBER() OVER (PARTITION BY "plantId" ORDER BY "createdAt", id) - 1)::bigint AS rn
        FROM appointments
      )
      UPDATE appointments a
      SET "plantAppointmentNumber" = n.rn
      FROM numbered n
      WHERE a.id = n.id
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_appointments_plant_plant_appointment_number" ON "appointments" ("plantId", "plantAppointmentNumber")`,
    );

    // Contador por planta para asignación segura y concurrente
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plant_appointment_counters" (
        "plantId" uuid PRIMARY KEY,
        "lastNumber" bigint NOT NULL DEFAULT -1,
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_plant_appointment_counters_plant" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE
      )
    `);

    // Inicializar contadores desde datos existentes
    await queryRunner.query(`
      INSERT INTO "plant_appointment_counters" ("plantId", "lastNumber")
      SELECT "plantId", COALESCE(MAX("plantAppointmentNumber"), -1)
      FROM "appointments"
      GROUP BY "plantId"
      ON CONFLICT ("plantId") DO UPDATE
      SET "lastNumber" = EXCLUDED."lastNumber",
          "updatedAt" = now()
    `);

    // Trigger function para asignar próximo número por planta
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION assign_plant_appointment_number()
      RETURNS TRIGGER AS $$
      DECLARE
        next_number bigint;
      BEGIN
        IF NEW."plantAppointmentNumber" IS NOT NULL THEN
          RETURN NEW;
        END IF;

        INSERT INTO "plant_appointment_counters" ("plantId", "lastNumber")
        VALUES (NEW."plantId", 0)
        ON CONFLICT ("plantId")
        DO UPDATE SET
          "lastNumber" = "plant_appointment_counters"."lastNumber" + 1,
          "updatedAt" = now()
        RETURNING "lastNumber" INTO next_number;

        NEW."plantAppointmentNumber" := next_number;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_assign_plant_appointment_number ON "appointments";
      CREATE TRIGGER trg_assign_plant_appointment_number
      BEFORE INSERT ON "appointments"
      FOR EACH ROW
      EXECUTE FUNCTION assign_plant_appointment_number();
    `);

    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "plantAppointmentNumber" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "plantAppointmentNumber" DROP NOT NULL`,
    );

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_assign_plant_appointment_number ON "appointments"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS assign_plant_appointment_number`);

    await queryRunner.query(`DROP TABLE IF EXISTS "plant_appointment_counters"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_appointments_plant_plant_appointment_number"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "plantAppointmentNumber"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminActionLogs1771820000000 implements MigrationInterface {
  name = 'CreateAdminActionLogs1771820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_action_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "plantId" uuid,
        "userId" uuid NOT NULL,
        "userEmail" character varying(200) NOT NULL,
        "userRole" character varying(50) NOT NULL,
        "action" character varying(100) NOT NULL,
        "targetType" character varying(60) NOT NULL,
        "targetId" character varying(120),
        "before" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "after" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_action_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_logs_plant_createdAt"
      ON "admin_action_logs" ("plantId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_logs_user_createdAt"
      ON "admin_action_logs" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_logs_action_createdAt"
      ON "admin_action_logs" ("action", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_action_logs_action_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_action_logs_user_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_action_logs_plant_createdAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_action_logs"`);
  }
}

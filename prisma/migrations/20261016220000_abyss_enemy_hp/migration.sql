-- AlterTable
ALTER TABLE "AbyssChallenge" ADD COLUMN     "hpMultiplier" DOUBLE PRECISION,
ADD COLUMN     "hpOverrides" JSONB;

-- Multiplicador de HP positivo quando informado
ALTER TABLE "AbyssChallenge" ADD CONSTRAINT "AbyssChallenge_hpMultiplier_check" CHECK ("hpMultiplier" IS NULL OR ("hpMultiplier" > 0 AND "hpMultiplier" <= 100));

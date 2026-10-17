-- Regras do draft v2: imunidade, passar sem opções, relógio por jogador e desfazer.

-- AlterEnum
ALTER TYPE "DraftActionType" ADD VALUE 'IMMUNE';
ALTER TYPE "DraftActionType" ADD VALUE 'SKIP';

-- AlterTable
ALTER TABLE "DraftAction" ALTER COLUMN "characterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "turnStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "clockUsedMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "undosUsed" INTEGER NOT NULL DEFAULT 0;

-- Só a ação SKIP fica sem personagem (comparação por texto: o valor novo do enum não pode ser usado na mesma transação).
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_skip_character_check" CHECK ((("type")::text = 'SKIP') = ("characterId" IS NULL));
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_draft_counters_check" CHECK ("clockUsedMs" >= 0 AND "undosUsed" >= 0);

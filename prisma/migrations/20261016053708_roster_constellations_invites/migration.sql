-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "CharacterPrice" ADD COLUMN     "constellationOverrides" JSONB;

-- AlterTable
ALTER TABLE "MatchDeckSnapshotEntry" ADD COLUMN     "constellation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "PriceChange" ADD COLUMN     "newOverrides" JSONB,
ADD COLUMN     "previousOverrides" JSONB;

-- CreateTable
CREATE TABLE "OwnedCharacter" (
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "constellation" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnedCharacter_pkey" PRIMARY KEY ("userId","characterId")
);

-- CreateTable
CREATE TABLE "MatchInvite" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "MatchInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnedCharacter_characterId_idx" ON "OwnedCharacter"("characterId");

-- CreateIndex
CREATE INDEX "MatchInvite_toUserId_status_idx" ON "MatchInvite"("toUserId", "status");

-- CreateIndex
CREATE INDEX "MatchInvite_matchId_idx" ON "MatchInvite"("matchId");

-- AddForeignKey
ALTER TABLE "OwnedCharacter" ADD CONSTRAINT "OwnedCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedCharacter" ADD CONSTRAINT "OwnedCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInvite" ADD CONSTRAINT "MatchInvite_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInvite" ADD CONSTRAINT "MatchInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInvite" ADD CONSTRAINT "MatchInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integridade: constelação C0..C6 e nível 1..100.
ALTER TABLE "OwnedCharacter" ADD CONSTRAINT "OwnedCharacter_constellation_range" CHECK ("constellation" BETWEEN 0 AND 6);
ALTER TABLE "OwnedCharacter" ADD CONSTRAINT "OwnedCharacter_level_range" CHECK ("level" BETWEEN 1 AND 100);
ALTER TABLE "MatchDeckSnapshotEntry" ADD CONSTRAINT "MatchDeckSnapshotEntry_constellation_range" CHECK ("constellation" BETWEEN 0 AND 6);
-- No máximo um convite pendente por partida.
CREATE UNIQUE INDEX "MatchInvite_one_pending_per_match_key" ON "MatchInvite"("matchId") WHERE "status" = 'PENDING';

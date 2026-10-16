-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Element" AS ENUM ('PYRO', 'HYDRO', 'ANEMO', 'ELECTRO', 'DENDRO', 'CRYO', 'GEO');

-- CreateEnum
CREATE TYPE "WeaponType" AS ENUM ('SWORD', 'CLAYMORE', 'POLEARM', 'BOW', 'CATALYST');

-- CreateEnum
CREATE TYPE "PriceVersionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PriceChangeSource" AS ENUM ('INITIAL', 'MANUAL', 'SUGGESTED');

-- CreateEnum
CREATE TYPE "AbyssCycleStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ChamberHalf" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'READY', 'BANNING', 'PICKING', 'LOCKED', 'AWAITING_RESULTS', 'DISPUTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Seat" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "DraftActionType" AS ENUM ('BAN', 'PICK');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('ACCEPT_TIMES', 'FORCE_WINNER', 'DRAW', 'VOID');

-- CreateEnum
CREATE TYPE "BalanceRunKind" AS ENUM ('DAILY', 'WEEKLY', 'MANUAL', 'EXTRAORDINARY');

-- CreateEnum
CREATE TYPE "MetricScope" AS ENUM ('CURRENT_CYCLE', 'HISTORICAL', 'OVERALL');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nicknameKey" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "genshinUid" TEXT,
    "bio" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "defaultDeckId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "element" "Element" NOT NULL,
    "weaponType" "WeaponType" NOT NULL,
    "rarity" INTEGER NOT NULL,
    "iconUrl" TEXT,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "competitiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "missingFromSource" BOOLEAN NOT NULL DEFAULT false,
    "balanceLocked" BOOLEAN NOT NULL DEFAULT false,
    "balanceLockReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceVersion" (
    "id" TEXT NOT NULL,
    "number" INTEGER,
    "label" TEXT,
    "status" "PriceVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "basedOnId" TEXT,
    "createdById" TEXT,
    "publishedById" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterPrice" (
    "id" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CharacterPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "previousCost" INTEGER,
    "newCost" INTEGER NOT NULL,
    "source" "PriceChangeSource" NOT NULL,
    "justification" TEXT NOT NULL,
    "adminId" TEXT,
    "proposalId" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3),

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckCharacter" (
    "deckId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckCharacter_pkey" PRIMARY KEY ("deckId","characterId")
);

-- CreateTable
CREATE TABLE "AbyssCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rules" TEXT NOT NULL,
    "status" "AbyssCycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbyssCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbyssChallenge" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "chamber" INTEGER NOT NULL,
    "half" "ChamberHalf" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "AbyssChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "hostId" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "abyssCycleId" TEXT,
    "config" JSONB NOT NULL,
    "rules" JSONB,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "winnerSeat" "Seat",
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "draftStartedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" "Seat" NOT NULL,
    "deckId" TEXT,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "MatchOutcome",
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDeckSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "seat" "Seat" NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceDeckId" TEXT,
    "deckName" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDeckSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDeckSnapshotEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "element" "Element" NOT NULL,
    "weaponType" "WeaponType" NOT NULL,
    "rarity" INTEGER NOT NULL,
    "iconUrl" TEXT,

    CONSTRAINT "MatchDeckSnapshotEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftAction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "type" "DraftActionType" NOT NULL,
    "actorSeat" "Seat" NOT NULL,
    "targetSeat" "Seat" NOT NULL,
    "characterId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "seat" "Seat" NOT NULL,
    "userId" TEXT NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "finalTimeMs" INTEGER,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultEvidence" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDispute" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "againstSeat" "Seat" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "DisputeResolution",
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceRun" (
    "id" TEXT NOT NULL,
    "kind" "BalanceRunKind" NOT NULL,
    "generateProposals" BOOLEAN NOT NULL DEFAULT false,
    "triggeredById" TEXT,
    "abyssCycleId" TEXT,
    "priceVersionId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "params" JSONB NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceMetric" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "scope" "MetricScope" NOT NULL,
    "matches" INTEGER NOT NULL,
    "deckAppearances" INTEGER NOT NULL,
    "bans" INTEGER NOT NULL,
    "pickOpportunities" INTEGER NOT NULL,
    "picks" INTEGER NOT NULL,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "pickRate" DOUBLE PRECISION NOT NULL,
    "banRate" DOUBLE PRECISION NOT NULL,
    "winRate" DOUBLE PRECISION,
    "smoothedWinRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "basePriceVersionId" TEXT NOT NULL,
    "currentCost" INTEGER NOT NULL,
    "suggestedCost" INTEGER NOT NULL,
    "approvedCost" INTEGER,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_nicknameKey_key" ON "User"("nicknameKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_defaultDeckId_key" ON "User"("defaultDeckId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_slug_key" ON "Character"("slug");

-- CreateIndex
CREATE INDEX "Character_competitiveEnabled_idx" ON "Character"("competitiveEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "Character_externalSource_externalId_key" ON "Character"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceVersion_number_key" ON "PriceVersion"("number");

-- CreateIndex
CREATE INDEX "PriceVersion_status_idx" ON "PriceVersion"("status");

-- CreateIndex
CREATE INDEX "CharacterPrice_characterId_idx" ON "CharacterPrice"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterPrice_priceVersionId_characterId_key" ON "CharacterPrice"("priceVersionId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceChange_proposalId_key" ON "PriceChange"("proposalId");

-- CreateIndex
CREATE INDEX "PriceChange_characterId_idx" ON "PriceChange"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceChange_priceVersionId_characterId_key" ON "PriceChange"("priceVersionId", "characterId");

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");

-- CreateIndex
CREATE INDEX "DeckCharacter_characterId_idx" ON "DeckCharacter"("characterId");

-- CreateIndex
CREATE INDEX "AbyssCycle_status_startsAt_idx" ON "AbyssCycle"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbyssChallenge_cycleId_floor_chamber_half_key" ON "AbyssChallenge"("cycleId", "floor", "chamber", "half");

-- CreateIndex
CREATE UNIQUE INDEX "Match_code_key" ON "Match"("code");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_completedAt_idx" ON "Match"("completedAt");

-- CreateIndex
CREATE INDEX "Match_hostId_idx" ON "Match"("hostId");

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_seat_key" ON "MatchPlayer"("matchId", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDeckSnapshot_matchId_seat_key" ON "MatchDeckSnapshot"("matchId", "seat");

-- CreateIndex
CREATE INDEX "MatchDeckSnapshotEntry_characterId_idx" ON "MatchDeckSnapshotEntry"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDeckSnapshotEntry_snapshotId_characterId_key" ON "MatchDeckSnapshotEntry"("snapshotId", "characterId");

-- CreateIndex
CREATE INDEX "DraftAction_characterId_idx" ON "DraftAction"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftAction_matchId_stepIndex_key" ON "DraftAction"("matchId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DraftAction_matchId_type_targetSeat_characterId_key" ON "DraftAction"("matchId", "type", "targetSeat", "characterId");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_createdAt_idx" ON "MatchEvent"("matchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_seat_key" ON "MatchResult"("matchId", "seat");

-- CreateIndex
CREATE INDEX "MatchDispute_status_idx" ON "MatchDispute"("status");

-- CreateIndex
CREATE INDEX "MatchDispute_matchId_idx" ON "MatchDispute"("matchId");

-- CreateIndex
CREATE INDEX "BalanceRun_createdAt_idx" ON "BalanceRun"("createdAt");

-- CreateIndex
CREATE INDEX "BalanceMetric_characterId_createdAt_idx" ON "BalanceMetric"("characterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceMetric_runId_characterId_scope_key" ON "BalanceMetric"("runId", "characterId", "scope");

-- CreateIndex
CREATE INDEX "BalanceProposal_status_idx" ON "BalanceProposal"("status");

-- CreateIndex
CREATE INDEX "BalanceProposal_characterId_idx" ON "BalanceProposal"("characterId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entityType_entityId_idx" ON "AdminAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_job_periodKey_key" ON "JobRun"("job", "periodKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultDeckId_fkey" FOREIGN KEY ("defaultDeckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceVersion" ADD CONSTRAINT "PriceVersion_basedOnId_fkey" FOREIGN KEY ("basedOnId") REFERENCES "PriceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceVersion" ADD CONSTRAINT "PriceVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceVersion" ADD CONSTRAINT "PriceVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPrice" ADD CONSTRAINT "CharacterPrice_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "PriceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPrice" ADD CONSTRAINT "CharacterPrice_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "PriceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "BalanceProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCharacter" ADD CONSTRAINT "DeckCharacter_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCharacter" ADD CONSTRAINT "DeckCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbyssChallenge" ADD CONSTRAINT "AbyssChallenge_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AbyssCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "PriceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_abyssCycleId_fkey" FOREIGN KEY ("abyssCycleId") REFERENCES "AbyssCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckSnapshot" ADD CONSTRAINT "MatchDeckSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckSnapshot" ADD CONSTRAINT "MatchDeckSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckSnapshot" ADD CONSTRAINT "MatchDeckSnapshot_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "PriceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckSnapshotEntry" ADD CONSTRAINT "MatchDeckSnapshotEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MatchDeckSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckSnapshotEntry" ADD CONSTRAINT "MatchDeckSnapshotEntry_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultEvidence" ADD CONSTRAINT "ResultEvidence_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceRun" ADD CONSTRAINT "BalanceRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceRun" ADD CONSTRAINT "BalanceRun_abyssCycleId_fkey" FOREIGN KEY ("abyssCycleId") REFERENCES "AbyssCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceRun" ADD CONSTRAINT "BalanceRun_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "PriceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceMetric" ADD CONSTRAINT "BalanceMetric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BalanceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceMetric" ADD CONSTRAINT "BalanceMetric_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceProposal" ADD CONSTRAINT "BalanceProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BalanceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceProposal" ADD CONSTRAINT "BalanceProposal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceProposal" ADD CONSTRAINT "BalanceProposal_basePriceVersionId_fkey" FOREIGN KEY ("basePriceVersionId") REFERENCES "PriceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceProposal" ADD CONSTRAINT "BalanceProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integridade: no máximo uma tabela de preços em cada estado DRAFT / SCHEDULED / ACTIVE.
CREATE UNIQUE INDEX "PriceVersion_single_open_status_key" ON "PriceVersion"("status") WHERE "status" IN ('DRAFT', 'SCHEDULED', 'ACTIVE');

-- Integridade: pontos e tempos nunca negativos.
ALTER TABLE "CharacterPrice" ADD CONSTRAINT "CharacterPrice_cost_positive" CHECK ("cost" > 0);
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_time_positive" CHECK ("timeMs" > 0);

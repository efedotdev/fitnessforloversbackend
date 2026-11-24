ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "HealthData"
ADD COLUMN "sourceSampleId" TEXT;

ALTER TABLE "Pairing"
ADD COLUMN "pairKey" TEXT;

CREATE UNIQUE INDEX "Pairing_pairKey_key" ON "Pairing"("pairKey");

CREATE UNIQUE INDEX "HealthData_userId_sourceSampleId_key"
ON "HealthData"("userId", "sourceSampleId");

CREATE TABLE "SharedGoal" (
    "id" TEXT NOT NULL,
    "pairingId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SharedGoal_pairingId_startDate_endDate_idx"
ON "SharedGoal"("pairingId", "startDate", "endDate");

CREATE INDEX "SharedGoal_createdById_idx" ON "SharedGoal"("createdById");

ALTER TABLE "SharedGoal"
ADD CONSTRAINT "SharedGoal_pairingId_fkey"
FOREIGN KEY ("pairingId") REFERENCES "Pairing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedGoal"
ADD CONSTRAINT "SharedGoal_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

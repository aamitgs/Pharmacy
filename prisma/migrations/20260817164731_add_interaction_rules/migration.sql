-- interaction_rules is a shared, curated reference catalog with no
-- tenantId — deliberately left unprotected by RLS, same reasoning as
-- subscription_plans (see that model's comment in schema.prisma).

-- CreateEnum
CREATE TYPE "InteractionSeverity" AS ENUM ('caution', 'warning');

-- CreateTable
CREATE TABLE "interaction_rules" (
    "id" TEXT NOT NULL,
    "compositionA" TEXT NOT NULL,
    "compositionB" TEXT NOT NULL,
    "severity" "InteractionSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_rules_pkey" PRIMARY KEY ("id")
);

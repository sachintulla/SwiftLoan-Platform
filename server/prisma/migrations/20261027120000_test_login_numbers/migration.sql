-- Numbers an admin allows to sign in with the shared test code (additive).
CREATE TABLE "TestLoginNumber" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestLoginNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestLoginNumber_phone_key" ON "TestLoginNumber"("phone");

-- CreateTable
CREATE TABLE "SocialPoint" (
    "id" SERIAL NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "awardedBy" TEXT,
    "date" DATE NOT NULL,

    CONSTRAINT "SocialPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPoint_enrollmentId_idx" ON "SocialPoint"("enrollmentId");

-- AddForeignKey
ALTER TABLE "SocialPoint" ADD CONSTRAINT "SocialPoint_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


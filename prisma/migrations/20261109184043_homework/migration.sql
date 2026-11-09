-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "fromLessonId" INTEGER,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Homework_personId_lessonId_key" ON "Homework"("personId", "lessonId");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


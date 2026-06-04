-- AlterTable
ALTER TABLE "Book" ALTER COLUMN "pages" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "ChapterRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterRead_userId_bookId_idx" ON "ChapterRead"("userId", "bookId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterRead_userId_chapterId_key" ON "ChapterRead"("userId", "chapterId");

-- AddForeignKey
ALTER TABLE "ChapterRead" ADD CONSTRAINT "ChapterRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRead" ADD CONSTRAINT "ChapterRead_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRead" ADD CONSTRAINT "ChapterRead_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

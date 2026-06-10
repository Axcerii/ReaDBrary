/*
  Warnings:

  - The `theme` column on the `Book` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `theme` column on the `Club` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DragonTheme" AS ENUM ('Aqua', 'Artrish', 'Chronos', 'Drii', 'Goliath', 'Guizamark', 'Lada', 'Pestia', 'Pura', 'Shizari', 'Yinva');

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "theme",
ADD COLUMN     "theme" "DragonTheme";

-- AlterTable
ALTER TABLE "Club" DROP COLUMN "theme",
ADD COLUMN     "theme" "DragonTheme";

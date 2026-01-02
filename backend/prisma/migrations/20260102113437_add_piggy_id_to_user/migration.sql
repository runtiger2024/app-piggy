/*
  Warnings:

  - A unique constraint covering the columns `[piggyId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "piggyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_piggyId_key" ON "User"("piggyId");

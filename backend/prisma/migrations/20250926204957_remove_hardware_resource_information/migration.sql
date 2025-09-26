/*
  Warnings:

  - You are about to drop the column `cpu_cores` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `cpu_model` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `disk_details` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `load_average` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `ram_installed` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `swap_size` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `system_uptime` on the `hosts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."hosts" DROP COLUMN "cpu_cores",
DROP COLUMN "cpu_model",
DROP COLUMN "disk_details",
DROP COLUMN "load_average",
DROP COLUMN "ram_installed",
DROP COLUMN "swap_size",
DROP COLUMN "system_uptime";

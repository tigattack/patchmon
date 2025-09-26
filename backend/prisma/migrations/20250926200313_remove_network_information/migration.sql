/*
  Warnings:

  - You are about to drop the column `dns_servers` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `gateway_ip` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `network_interfaces` on the `hosts` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."dashboard_preferences_card_id_idx";

-- DropIndex
DROP INDEX "public"."dashboard_preferences_user_card_idx";

-- DropIndex
DROP INDEX "public"."dashboard_preferences_user_id_idx";

-- AlterTable
ALTER TABLE "public"."hosts" DROP COLUMN "ip",
DROP COLUMN "dns_servers",
DROP COLUMN "gateway_ip",
DROP COLUMN "network_interfaces";

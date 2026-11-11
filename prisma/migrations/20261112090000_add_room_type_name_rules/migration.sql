-- Per-property mapping from VHP room CODES to readable room NAMES, resolved at
-- read time so the report shows names instead of codes.
CREATE TABLE "room_type_name_rules" (
    "id" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_type_name_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_type_name_rules_propertyCode_roomCode_key"
    ON "room_type_name_rules"("propertyCode", "roomCode");

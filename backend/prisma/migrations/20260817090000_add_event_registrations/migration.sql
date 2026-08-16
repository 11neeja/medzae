-- CreateTable: a user's confirmed registration for an event.
-- External events (Eventbrite / Hack Club / Devpost) live only in a 24-hour
-- in-memory cache, so every row carries a full snapshot of the event instead
-- of a foreign key — a calendar entry has to survive the source dropping the
-- listing. remindedDayBeforeAt / remindedDayOfAt make the reminder sweep
-- idempotent: a stamped column is never re-sent.
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'local',
    "title" TEXT NOT NULL,
    "organizer" TEXT,
    "dateText" TEXT,
    "timeText" TEXT,
    "location" TEXT,
    "mode" TEXT,
    "type" TEXT,
    "imageUrl" TEXT,
    "externalUrl" TEXT,
    "startAt" TIMESTAMP(3),
    "remindedDayBeforeAt" TIMESTAMP(3),
    "remindedDayOfAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_userId_eventKey_key" ON "EventRegistration"("userId", "eventKey");
CREATE INDEX "EventRegistration_userId_idx" ON "EventRegistration"("userId");
CREATE INDEX "EventRegistration_startAt_idx" ON "EventRegistration"("startAt");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: everyone already registered for a local event only exists in the
-- implicit "_EventRegistrations" join table (A = Event.id, B = User.id).
-- Without this they'd have a registration the calendar can't see and would get
-- no reminders until they un-registered and registered again.
--
-- startAt is deliberately left NULL here rather than parsed in SQL: Event.date
-- is free text, and a cast that throws would fail the whole deploy. The server
-- fills it in on boot using the same resolver every other code path uses
-- (backfillMissingStartAt in utils/eventReminders.js).
INSERT INTO "EventRegistration" (
    "id", "userId", "eventKey", "source", "title", "organizer",
    "dateText", "timeText", "location", "mode", "type", "imageUrl",
    "createdAt", "updatedAt"
)
SELECT
    'evreg_' || md5(j."B" || ':' || j."A"),
    j."B", j."A", 'local', e."title", e."organizer",
    e."date", e."time", e."location", e."mode", e."type", e."imageUrl",
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_EventRegistrations" j
JOIN "Event" e ON e."id" = j."A"
ON CONFLICT ("userId", "eventKey") DO NOTHING;

-- Multi-day events. Previously a registration stored only a start instant, so
-- a conference running 14–16 Aug occupied a single calendar square and the
-- other two days looked free.
--
-- Only the UTC calendar date of "endAt" is meaningful: it decides how many
-- squares an event covers. Reminders continue to key off startAt alone, so a
-- six-week hackathon still reminds once before it opens rather than daily.
ALTER TABLE "EventRegistration" ADD COLUMN "endAt" TIMESTAMP(3);
ALTER TABLE "EventRegistration" ADD COLUMN "endDateText" TEXT;

-- Locally hosted events get an optional end date to match.
ALTER TABLE "Event" ADD COLUMN "endDate" TEXT;

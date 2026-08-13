ALTER TABLE "platform"."video_jobs"
  ADD COLUMN IF NOT EXISTS "loop_state" JSONB;

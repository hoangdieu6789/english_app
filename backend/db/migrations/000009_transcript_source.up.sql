-- Where the transcript of an attempt came from: azure (its own recognition) or whisper
-- (whisper.cpp on the host; Azure then scored the audio against that transcript).
-- NULL for older attempts (all were azure).
ALTER TABLE pronunciation_attempts ADD COLUMN transcript_source TEXT
  CHECK (transcript_source IN ('azure', 'whisper'));

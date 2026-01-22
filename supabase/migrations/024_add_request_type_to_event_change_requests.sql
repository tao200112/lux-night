-- Add request_type column to event_change_requests table
-- 为 event_change_requests 表添加 request_type 字段

-- Add request_type column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'event_change_requests' 
    AND column_name = 'request_type'
  ) THEN
    ALTER TABLE event_change_requests 
    ADD COLUMN request_type TEXT NOT NULL DEFAULT 'general' 
    CHECK (request_type IN ('poster', 'price', 'inventory', 'general'));
    
    -- Create index for request_type
    CREATE INDEX idx_event_change_requests_request_type 
    ON event_change_requests(request_type);
  END IF;
END $$;

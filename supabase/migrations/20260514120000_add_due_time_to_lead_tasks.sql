ALTER TABLE public.lead_tasks
ADD COLUMN IF NOT EXISTS due_time time;

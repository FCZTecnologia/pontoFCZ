CREATE TABLE public.punch_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  punched_at TIMESTAMP WITH TIME ZONE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('entrada','saida_almoco','retorno_almoco','saida')),
  note TEXT,
  is_retroactive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_records TO authenticated;
GRANT ALL ON public.punch_records TO service_role;
ALTER TABLE public.punch_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own punch records" ON public.punch_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX punch_records_user_punched_at_idx ON public.punch_records (user_id, punched_at);
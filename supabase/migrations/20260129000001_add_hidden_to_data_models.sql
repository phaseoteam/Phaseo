-- Add hidden flag to data_models for soft-hiding models from public listings.
ALTER TABLE public.data_models
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS data_models_hidden_idx
  ON public.data_models (hidden);

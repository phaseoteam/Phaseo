CREATE TABLE "public"."v2_benchmark_source_model_pins" (
  "pin_id"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_id"  text,
  "label"      text                     NOT NULL,
  "model_slug" text,
  "effort"     text,
  "ignored"    boolean                  NOT NULL DEFAULT false,
  "note"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_benchmark_source_model_pins_pkey" PRIMARY KEY (pin_id),
  CONSTRAINT "v2_benchmark_source_model_pins_check" CHECK ((ignored OR (model_slug IS NOT NULL))),
  CONSTRAINT "v2_benchmark_source_model_pins_label_check" CHECK (((label = lower(btrim(label))) AND (label <> ''::text))),
  CONSTRAINT "v2_benchmark_source_model_pins_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_benchmark_source_model_pins_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.v2_benchmark_sources(source_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_benchmark_source_model_pins"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_benchmark_source_model_pins_label_idx ON public.v2_benchmark_source_model_pins USING btree (COALESCE(source_id, ''::text), label);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."v2_benchmark_source_model_pins" TO "service_role";

-- GPT-5.5 and the GPT-5.6 models had no input or output types, so every
-- retired OpenAI model pointing at them looked like it lost text output and
-- was left out of automatic successor approval. Their routes offer the same
-- capabilities as GPT-5.4 (text generation, tool calls, structured output),
-- so they get its types: text and image in, text out.
-- Guarded on the empty arrays seen in prod on 2026-10-21; history is kept by
-- the catalogue_row_history trigger on public.v2_models.
update public.v2_models
set input_modalities = '{text,image}',
  output_modalities = '{text}'
where model_slug in (
    'openai/gpt-5.5',
    'openai/gpt-5.6-luna',
    'openai/gpt-5.6-luna-pro',
    'openai/gpt-5.6-sol',
    'openai/gpt-5.6-sol-pro',
    'openai/gpt-5.6-terra',
    'openai/gpt-5.6-terra-pro'
  )
  and cardinality(input_modalities) = 0
  and cardinality(output_modalities) = 0;

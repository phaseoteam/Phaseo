-- Second pass over model licences after 20261020155924.
--
-- 1. Rows with a wrong licence, checked against the publisher's Hugging Face
--    repo: Hy3 ships under Apache 2.0 (only Hy3 preview uses the Tencent Hy
--    licence) and DeepSeek V4 Pro 0813 is MIT.
-- 2. Rows labelled only "Open weights" get their actual licence. Seed 2.0 Code
--    has no published weights, like the rest of Seed 2.0, so it is Proprietary.
-- 3. A few rows with no licence: DeepSeek V4.1 Flash variants and a duplicate
--    Seedance 1.5 Pro slug.
-- 4. Licence names follow one style: the licence's own title, without a
--    trailing "Agreement", and no shortened names ("Gemma", "OpenRAIL++").
--
-- Every update is guarded on the value seen in prod on 2026-10-21, so a newer
-- admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.

with fixes (model_slug, old_license, license, license_url) as (
values
  ('tencent/hy3', 'Tencent Hy Community License Agreement', 'Apache 2.0', 'https://huggingface.co/tencent/Hy3/blob/main/LICENSE'),
  ('tencent/hy3:free', 'Tencent Hy Community License Agreement', 'Apache 2.0', 'https://huggingface.co/tencent/Hy3/blob/main/LICENSE'),
  ('deepseek/deepseek-v4-pro-0813', 'Proprietary', 'MIT', 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813'),
  ('baichuan/baichuan-m2-32b', 'Open weights', 'Apache 2.0', 'https://huggingface.co/baichuan-inc/Baichuan-M2-32B'),
  ('bytedance/seed-2.0-code', 'Open weights', 'Proprietary', null),
  ('deepseek/deepseek-chat', 'Open weights', 'MIT', null),
  ('deepseek/deepseek-reasoner', 'Open weights', 'MIT', null),
  ('gryphe/mythomax-l2-13b', 'Open weights', 'Llama 2 Community License', 'https://huggingface.co/Gryphe/MythoMax-L2-13b'),
  ('lightricks/ltx-2.3-fast', 'Open weights', 'LTX-2 Community License', 'https://huggingface.co/Lightricks/LTX-2.3'),
  ('mistral/devstral-latest', 'Open weights', 'Modified MIT', 'https://huggingface.co/mistralai/Devstral-2-123B-Instruct-2512'),
  ('mistral/devstral-small-latest', 'Open weights', 'Apache 2.0', 'https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512'),
  ('mistral/mistral-small-2603', 'Open weights', 'Apache 2.0', 'https://huggingface.co/mistralai/Mistral-Small-4-119B-2603'),
  ('nvidia/nemotron-3-ultra-nvfp4', 'Open weights', 'OpenMDW-1.1', 'https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4'),
  ('nvidia/nvidia-nemotron-3-ultra', 'Open weights', 'OpenMDW-1.1', 'https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16'),
  ('nvidia/nemotron-3.5-content-safety', 'Open weights', 'OpenMDW-1.1', 'https://huggingface.co/nvidia/Nemotron-3.5-Content-Safety'),
  ('nvidia/nemotron-lightning-3.5-30b-a3b', 'Open weights', 'OpenMDW-1.1', 'https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16'),
  ('thinking-machines/inkling-256k', 'Open weights', 'Apache 2.0', 'https://huggingface.co/thinkingmachines/Inkling'),
  ('z-ai/glm-5.2-fast', 'Open weights', 'MIT', 'https://huggingface.co/zai-org/GLM-5.2')
)
update public.v2_models model
set license = fixes.license,
    license_url = coalesce(model.license_url, fixes.license_url)
from fixes
where model.model_slug = fixes.model_slug
  and model.license = fixes.old_license;

with fills (model_slug, license, license_url) as (
values
  ('deepseek/deepseek-v4.1-flash-beta', 'MIT', 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash'),
  ('deepseek/deepseek-v4.1-flash-fast', 'MIT', 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash'),
  ('deepseek/deepseek-v4.1-flash-preview', 'MIT', 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash'),
  ('bytedance/seedance-1-5-pro', 'Proprietary', null)
)
update public.v2_models model
set license = fills.license,
    license_url = coalesce(model.license_url, fills.license_url)
from fills
where model.model_slug = fills.model_slug
  and nullif(btrim(model.license), '') is null;

with renames (old_license, new_license) as (
values
  ('Gemma', 'Gemma Terms of Use'),
  ('Google Health AI', 'Health AI Developer Foundations Terms'),
  ('OpenRAIL++', 'CreativeML OpenRAIL++-M'),
  ('EXAONE AI Model License Agreement 1.1 - NC', 'EXAONE AI Model License 1.1 NC'),
  ('EXAONE AI Model License Agreement 1.2 - NC', 'EXAONE AI Model License 1.2 NC'),
  ('K-EXAONE License', 'K-EXAONE AI Model License'),
  ('MiniMax H3 Community License Agreement', 'MiniMax H3 Community License'),
  ('Tencent Hy Community License Agreement', 'Tencent Hy Community License'),
  ('HyperCLOVA X Custom License', 'HyperCLOVA X SEED Model License'),
  ('Qwen Community License', 'Qwen Community License 1.0')
)
update public.v2_models model
set license = renames.new_license
from renames
where model.license = renames.old_license;

update public.v2_models
set license_url = 'https://developers.google.com/health-ai-developer-foundations/terms'
where license = 'Health AI Developer Foundations Terms'
  and license_url is null;

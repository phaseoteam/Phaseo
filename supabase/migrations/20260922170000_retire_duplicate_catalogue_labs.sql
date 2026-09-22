-- Retire duplicate imported lab aliases after the original repair migration.
-- phaseo:allow-destructive-migration reason: remove temporary lab deletion guards after the protected migration has completed

alter table public.v2_labs enable trigger catalogue_no_removal;
drop trigger catalogue_lab_repair_no_removal on public.v2_labs;
drop function catalogue_private.prevent_lab_removal_during_repair();

delete from public.v2_lab_links
where platform = 'catalogue-repair-guard'
  and url = 'https://phaseo.app/models'
  and lab_slug in ('mistralai', 'ibm-granite', 'xai');

update public.v2_labs as lab
set status = 'disabled',
    routable = false,
    metadata = coalesce(lab.metadata, '{}'::jsonb) || jsonb_build_object(
      'duplicate_of', case lab.lab_slug
        when 'mistralai' then 'mistral'
        when 'ibm-granite' then 'ibm'
        when 'xai' then 'spacex-ai'
      end,
      'catalogue_artifact_repaired_at', coalesce(
        lab.metadata -> 'catalogue_artifact_repaired_at',
        to_jsonb(now())
      )
    ),
    updated_at = now()
where lab.lab_slug in ('mistralai', 'ibm-granite', 'xai')
  and (
    lab.status is distinct from 'disabled'
    or lab.routable is distinct from false
    or lab.metadata ->> 'duplicate_of' is distinct from case lab.lab_slug
      when 'mistralai' then 'mistral'
      when 'ibm-granite' then 'ibm'
      when 'xai' then 'spacex-ai'
    end
    or lab.metadata -> 'catalogue_artifact_repaired_at' is null
  )
  and not exists (
    select 1 from public.v2_models as model where model.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_providers as provider where provider.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_model_families as family where family.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_lab_links as link where link.lab_slug = lab.lab_slug
  );

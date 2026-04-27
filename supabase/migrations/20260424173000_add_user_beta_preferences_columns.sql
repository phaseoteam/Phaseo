alter table public.users
	add column if not exists beta_opt_in boolean;

alter table public.users
	add column if not exists beta_features jsonb;

update public.users
set
	beta_opt_in = coalesce(beta_opt_in, false),
	beta_features = case
		when beta_features is null or jsonb_typeof(beta_features) <> 'object' then '{}'::jsonb
		else beta_features
	end
where beta_opt_in is null
	or beta_features is null
	or jsonb_typeof(beta_features) <> 'object';

alter table public.users
	alter column beta_opt_in set default false,
	alter column beta_opt_in set not null,
	alter column beta_features set default '{}'::jsonb,
	alter column beta_features set not null;

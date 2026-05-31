-- Recalcula TMB/GET em qualquer INSERT ou UPDATE da anamnese
create or replace function public.calculate_tmb_get()
returns trigger language plpgsql as $$
declare
  v_age integer;
  v_tmb numeric;
begin
  if new.birth_date is null or new.current_weight is null or new.height is null or new.biological_sex is null then
    return new;
  end if;

  v_age := date_part('year', age(new.birth_date));

  if new.biological_sex = 'male' then
    v_tmb := (10 * new.current_weight) + (6.25 * new.height) - (5 * v_age) + 5;
  else
    v_tmb := (10 * new.current_weight) + (6.25 * new.height) - (5 * v_age) - 161;
  end if;

  new.tmb := round(v_tmb, 2);
  new.get_value := round(v_tmb * coalesce(new.activity_factor, 1.2), 2);

  return new;
end;
$$;

drop trigger if exists trg_calculate_tmb on public.anamnese;

create trigger trg_calculate_tmb
  before insert or update
  on public.anamnese
  for each row execute function public.calculate_tmb_get();

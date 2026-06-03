alter table public.students
  add column if not exists cpf             text,
  add column if not exists address         text,
  add column if not exists cep             text,
  add column if not exists contract_id     text,
  add column if not exists contract_status text not null default 'none';

-- contract_status: 'none' | 'pending' | 'signed'

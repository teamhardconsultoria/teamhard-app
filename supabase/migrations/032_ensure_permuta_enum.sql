-- Garante que 'permuta' existe no enum plan_type
-- (idempotente: IF NOT EXISTS não falha se já existir)
alter type plan_type add value if not exists 'permuta';

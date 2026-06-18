-- Make plan_type and plan_end nullable to support invite-based registration (plan set later by coach)
ALTER TABLE students ALTER COLUMN plan_type DROP NOT NULL;
ALTER TABLE students ALTER COLUMN plan_end DROP NOT NULL;

-- Table for student self-registration invite links
CREATE TABLE student_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  email TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ,
  student_id UUID REFERENCES students(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE student_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage their own invites"
  ON student_invites FOR ALL
  USING (
    coach_id IN (
      SELECT id FROM coaches WHERE user_id = auth.uid()
    )
  );

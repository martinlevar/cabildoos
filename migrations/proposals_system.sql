-- ================================================================
--  CabildoOS — Sistema de Propuestas Ciudadanas
--  Ejecutar en Supabase → SQL Editor
-- ================================================================

-- 1. Tabla de propuestas
CREATE TABLE IF NOT EXISTS proposals (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  seat_number  int  NOT NULL,
  text         text NOT NULL,
  cat          text DEFAULT 'General',
  likes        int  DEFAULT 0,
  status       text DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  created_at   timestamptz DEFAULT now()
);

-- 2. Columna display en questions (sin FK — solo para mostrar butaca proponente)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS proposed_by_seat int;

-- 3. RLS
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_select" ON proposals;
DROP POLICY IF EXISTS "proposals_insert" ON proposals;
DROP POLICY IF EXISTS "proposals_update" ON proposals;

CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (true);

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Función: aprobar propuesta → inserta en questions automáticamente
CREATE OR REPLACE FUNCTION approve_proposal(
  p_proposal_id  uuid,
  p_duration_min int DEFAULT 1440
)
RETURNS uuid AS $$
DECLARE
  v_prop  proposals%ROWTYPE;
  v_q_id  uuid;
BEGIN
  SELECT * INTO v_prop FROM proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  INSERT INTO questions (text, category, status, proposed_by_seat, duration_minutes, created_at)
  VALUES (
    v_prop.text,
    v_prop.cat,
    'revision',
    v_prop.seat_number,
    p_duration_min,
    now()
  )
  RETURNING id INTO v_q_id;

  UPDATE proposals SET status = 'approved' WHERE id = p_proposal_id;

  RETURN v_q_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

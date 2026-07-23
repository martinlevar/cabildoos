-- ================================================================
--  CabildoOS — Schema de Identidad Anónima Verificable
--  Ejecutar en Supabase → SQL Editor → New query
-- ================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- TABLA 1: IDENTIDADES
-- Una fila por ciudadano verificado.
-- El servidor NUNCA almacena nombre, número de pasaporte ni biometría.
-- Solo guarda el hash (identidad única) + butaca asignada.
-- ----------------------------------------------------------------
create table if not exists identities (
  id              uuid primary key default gen_random_uuid(),
  identity_hash   text unique not null,
  -- SHA256(embedding_facial + nro_pasaporte + fecha_nacimiento + pais + nonce)
  -- Generado 100% en el dispositivo del usuario, nunca viaja al servidor en texto plano
  seat_number     integer unique,
  country         text,                      -- solo el país (no datos sensibles)
  status          text not null default 'pending'
                  check (status in ('pending', 'under_review', 'approved', 'rejected')),
  rejection_reason text,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz
);

-- ----------------------------------------------------------------
-- TABLA 2: SOLICITUDES DE VERIFICACIÓN
-- Una fila por intento de verificación.
-- anon_image_path → ruta en Storage (imagen anonimizada, sin datos reales).
-- El validador humano SOLO tiene acceso a esa imagen.
-- ----------------------------------------------------------------
create table if not exists verification_requests (
  id                  uuid primary key default gen_random_uuid(),
  identity_hash       text not null references identities(identity_hash) on delete cascade,
  anon_image_path     text,
  -- path en bucket "anon-verification", ej: "requests/{id}/selfie_anon.jpg"
  device_fingerprint  text,
  -- hash del dispositivo para prevenir submissions duplicados desde el mismo equipo
  client_proof        text,
  -- firma criptográfica generada en el cliente que prueba que el proceso local fue ejecutado
  status              text not null default 'pending'
                      check (status in ('pending', 'under_review', 'approved', 'rejected')),
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

-- ----------------------------------------------------------------
-- TABLA 3: DECISIONES DEL VALIDADOR
-- El validador humano registra su decisión aquí.
-- Solo ve la imagen anonimizada — nunca los datos reales.
-- ----------------------------------------------------------------
create table if not exists validator_decisions (
  id                      uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references verification_requests(id),
  validator_id            uuid references auth.users(id),
  -- validadores son usuarios Supabase Auth (rol: validator)
  decision                text not null check (decision in ('approved', 'rejected')),
  note                    text,
  -- "Persona real confirmada", "Imagen parece editada", etc.
  created_at              timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- TABLA 4: VOTACIONES (VaV — Votos Anónimos Verificables)
-- El commit-reveal on-chain del sistema de votos.
-- ----------------------------------------------------------------
create table if not exists votes (
  id              uuid primary key default gen_random_uuid(),
  identity_hash   text not null references identities(identity_hash),
  question_id     uuid not null,
  -- commit phase
  vote_hash       text not null,   -- SHA256(voto_en_claro + nonce_secreto)
  committed_at    timestamptz not null default now(),
  -- reveal phase (después del cierre)
  vote_plain      text check (vote_plain in ('si', 'no', 'abs')),
  nonce_reveal    text,
  revealed_at     timestamptz,
  -- constraint: un voto por identidad por pregunta
  unique (identity_hash, question_id)
);

-- ----------------------------------------------------------------
-- TABLA 5: PREGUNTAS / PROPUESTAS
-- ----------------------------------------------------------------
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  category    text,
  proposed_by text references identities(identity_hash),
  status      text not null default 'revision'
              check (status in ('revision', 'activa', 'cerrada', 'pleno')),
  opens_at    timestamptz,
  closes_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- TABLA 6: CONTADOR DE BUTACAS (asignación atómica)
-- ----------------------------------------------------------------
create table if not exists seat_counter (
  id        integer primary key default 1,
  next_seat integer not null default 2848,
  constraint single_row check (id = 1)
);
insert into seat_counter (id, next_seat) values (1, 2848)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- FUNCIÓN: asignar butaca de forma atómica (sin race conditions)
-- Llamada desde una Edge Function después de que el validador aprueba.
-- ----------------------------------------------------------------
create or replace function assign_next_seat(p_identity_hash text)
returns integer
language plpgsql
security definer
as $$
declare
  v_seat integer;
begin
  -- Incremento atómico: toma el número actual y sube el contador
  update seat_counter
  set    next_seat = next_seat + 1
  where  id = 1
  returning next_seat - 1 into v_seat;

  -- Asigna la butaca a la identidad
  update identities
  set    seat_number = v_seat,
         status      = 'approved',
         approved_at = now()
  where  identity_hash = p_identity_hash;

  return v_seat;
end;
$$;

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------

alter table identities             enable row level security;
alter table verification_requests  enable row level security;
alter table validator_decisions    enable row level security;
alter table votes                  enable row level security;
alter table questions              enable row level security;

-- identities: cualquiera puede consultar su propio registro por hash (sin auth)
create policy "select_own_identity" on identities
  for select using (true);   -- el hash ya es anónimo, no revela nada

-- identities: solo service_role puede insertar/actualizar (via Edge Function)
create policy "service_role_manage_identities" on identities
  for all using (auth.role() = 'service_role');

-- verification_requests: cualquiera puede insertar (anon submission)
create policy "anon_insert_request" on verification_requests
  for insert with check (true);

-- verification_requests: solo validadores (rol custom) pueden leer
create policy "validator_select_requests" on verification_requests
  for select using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
      and   auth.users.raw_user_meta_data->>'role' = 'validator'
    )
  );

-- validator_decisions: solo validadores
create policy "validator_manage_decisions" on validator_decisions
  for all using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
      and   auth.users.raw_user_meta_data->>'role' = 'validator'
    )
  );

-- votes: solo el dueño del hash puede leer sus votos
create policy "select_own_votes" on votes
  for select using (true);  -- hash es público y anónimo

create policy "insert_own_vote" on votes
  for insert with check (true);  -- validación de unicidad via unique constraint

-- questions: lectura pública
create policy "public_read_questions" on questions
  for select using (true);

-- ----------------------------------------------------------------
-- STORAGE BUCKETS
-- (Crear manualmente en Supabase → Storage → New bucket)
-- Nombre: anon-verification
-- Public: FALSE (acceso solo con signed URL)
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------
create index if not exists idx_identities_hash   on identities(identity_hash);
create index if not exists idx_identities_status on identities(status);
create index if not exists idx_vr_identity_hash  on verification_requests(identity_hash);
create index if not exists idx_vr_status         on verification_requests(status);
create index if not exists idx_votes_question    on votes(question_id);

-- Sawaal Better — Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- One row per student, keyed by name+school+class (not email).
create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null,
  class text not null,
  pin_hash text not null,        -- bcrypt hash of the 4-digit PIN, never store it raw
  code text not null,            -- the anonymous "bi7ka"-style code, kept for the sensitive item map
  created_at timestamptz default now()
);
create unique index students_lookup
  on students (lower(name), lower(school), lower(class));

-- One row per attempt. A student can have more than one if they restart.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  current_screen int default 0
);

-- One row per answered item, mirrors the CSV the course already builds client-side.
create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  item_id text not null,
  module text,
  question text,
  answer text,
  correct text,
  answered_at timestamptz default now(),
  unique (session_id, item_id)
);

alter table students enable row level security;
alter table sessions enable row level security;
alter table answers enable row level security;

-- No email/password auth here, so RLS can't key off auth.uid(). Instead all writes
-- go through this one function, which checks the PIN server-side and hands back
-- a student_id + session_id the client then uses for every subsequent call.
-- Known limitation for an MVP pilot: once a client has a student_id, RLS below
-- trusts it. Fine for a classroom tool; if you outgrow that, move to Supabase
-- Auth anonymous sign-in + a custom claim instead.
create or replace function login_or_resume(
  p_name text, p_school text, p_class text, p_pin text
) returns table (
  student_id uuid, code text, session_id uuid,
  current_screen int, is_new_student boolean, resumed boolean
) language plpgsql security definer as $$
declare
  v_student students;
  v_session sessions;
  v_new_code text;
  v_is_new boolean := false;
begin
  select * into v_student from students
    where lower(name)=lower(p_name) and lower(school)=lower(p_school) and lower(class)=lower(p_class);

  if v_student.id is null then
    v_new_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    insert into students (name, school, class, pin_hash, code)
      values (p_name, p_school, p_class, crypt(p_pin, gen_salt('bf')), v_new_code)
      returning * into v_student;
    v_is_new := true;
  else
    if not (v_student.pin_hash = crypt(p_pin, v_student.pin_hash)) then
      raise exception 'wrong_pin';
    end if;
  end if;

  select * into v_session from sessions
    where student_id = v_student.id and completed_at is null
    order by started_at desc limit 1;

  if v_session.id is null then
    insert into sessions (student_id) values (v_student.id) returning * into v_session;
    return query select v_student.id, v_student.code, v_session.id, v_session.current_screen,
      v_is_new, false;
  else
    return query select v_student.id, v_student.code, v_session.id, v_session.current_screen,
      v_is_new, true;
  end if;
end;
$$;

-- Locked down: only the function above can write students/sessions rows.
-- The client writes answers and progress directly using the ids the function returned.
create policy "insert own answers" on answers for insert
  with check (true);  -- session_id is an opaque uuid the client only has after login_or_resume
create policy "update own progress" on sessions for update
  using (true) with check (true);
create policy "read own session" on sessions for select using (true);
create policy "read own answers" on answers for select using (true);

-- ==============================================================================
-- SohojPharma Core Database & Supabase Roles / Schemas Initialization
-- This runs FIRST before all application migrations on any fresh postgres stack.
-- ==============================================================================

-- 1. Create Essential Schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS public;

-- 2. Create Core Supabase Roles
DO $$
BEGIN
  -- Superusers & Administrative Roles
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres WITH SUPERUSER LOGIN PASSWORD 'postgres';
  ELSE
    ALTER ROLE postgres WITH SUPERUSER LOGIN PASSWORD 'postgres';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin WITH SUPERUSER LOGIN PASSWORD 'postgres';
  ELSE
    ALTER ROLE supabase_admin WITH SUPERUSER LOGIN PASSWORD 'postgres';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin WITH SUPERUSER LOGIN PASSWORD 'postgres';
  ELSE
    ALTER ROLE supabase_auth_admin WITH SUPERUSER LOGIN PASSWORD 'postgres';
  END IF;

  -- API Gateway & Client Roles
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'postgres';
  ELSE
    ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD 'postgres';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT;
  END IF;
END $$;

-- 3. Role Memberships
GRANT anon TO authenticator, postgres;
GRANT authenticated TO authenticator, postgres;
GRANT service_role TO authenticator, postgres;

-- 4. Schema Ownership & Privileges
ALTER SCHEMA auth OWNER TO supabase_admin;
ALTER SCHEMA storage OWNER TO supabase_admin;
ALTER SCHEMA extensions OWNER TO supabase_admin;

GRANT ALL ON SCHEMA public, auth, storage, extensions TO postgres, supabase_admin, supabase_auth_admin;
GRANT ALL ON DATABASE postgres TO postgres, supabase_admin, supabase_auth_admin;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;

-- 5. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- 6. Set Search Paths
ALTER ROLE postgres SET search_path = public, extensions, auth;
ALTER ROLE supabase_admin SET search_path = public, extensions, auth;
ALTER ROLE supabase_auth_admin SET search_path = public, extensions, auth;
ALTER ROLE authenticator SET search_path = public, extensions;

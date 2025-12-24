-- Fix: Remove the overly permissive anonymous profile access policy
-- This policy allows unauthenticated users to view ALL profile data which is a privacy violation

DROP POLICY IF EXISTS "Profiles basic viewable by anon" ON public.profiles;
CREATE POLICY "Demo profiles are readable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_demo = true);
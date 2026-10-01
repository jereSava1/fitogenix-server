-- Rollback de B-03 (solo si hiciera falta volver al acceso directo; ver baseline).
GRANT ALL ON TABLE public.profiles, public.saved_products, public.scan_history TO anon, authenticated;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "saved_products_select_own" ON public.saved_products FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "saved_products_insert_own" ON public.saved_products FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_products_delete_own" ON public.saved_products FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "scan_history_select_own" ON public.scan_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "scan_history_insert_own" ON public.scan_history FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "scan_history_update_own" ON public.scan_history FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "scan_history_delete_own" ON public.scan_history FOR DELETE USING (user_id = auth.uid());
-- is_username_available: recrear con el SQL de supabase/migrations/20260929000000_baseline.sql.

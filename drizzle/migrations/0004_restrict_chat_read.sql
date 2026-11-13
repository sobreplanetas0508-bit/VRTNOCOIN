DROP POLICY IF EXISTS "Players read global chat" ON public.chat_messages;
CREATE POLICY "Players read recent global chat" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    created_at > now() - interval '7 days'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );
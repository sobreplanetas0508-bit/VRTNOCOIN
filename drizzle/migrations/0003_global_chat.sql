CREATE TABLE public.chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  influencer boolean NOT NULL DEFAULT false,
  owner boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_created_at_idx ON public.chat_messages (created_at DESC);
CREATE INDEX chat_messages_player_idx ON public.chat_messages (player_id, created_at DESC);

GRANT SELECT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read global chat" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me public.profiles;
  msg text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  last_at timestamptz;
  row public.chat_messages;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para continuar.';
  END IF;
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faça login para continuar.';
  END IF;
  IF msg = '' THEN
    RAISE EXCEPTION 'Escreva uma mensagem.';
  END IF;
  IF char_length(msg) > 200 THEN
    RAISE EXCEPTION 'Mensagem muito longa (máximo 200 letras).';
  END IF;
  SELECT max(created_at) INTO last_at FROM public.chat_messages WHERE player_id = me.id;
  IF last_at IS NOT NULL AND last_at > now() - interval '2 seconds' THEN
    RAISE EXCEPTION 'Calma! Espere um pouquinho para mandar outra mensagem.';
  END IF;

  INSERT INTO public.chat_messages (player_id, username, influencer, owner, body)
  VALUES (me.id, me.username, me.influencer, me.owner, msg)
  RETURNING * INTO row;

  -- Keep the chat light: drop messages older than 7 days.
  DELETE FROM public.chat_messages WHERE created_at < now() - interval '7 days';

  RETURN jsonb_build_object(
    'id', row.id, 'playerId', row.player_id, 'username', row.username,
    'influencer', row.influencer, 'owner', row.owner,
    'body', row.body, 'createdAt', row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(text) TO authenticated;
-- Player profiles (one per signed-in account)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  legacy_id integer UNIQUE,
  coins integer NOT NULL DEFAULT 0,
  owned_skins text[] NOT NULL DEFAULT ARRAY['palhaco']::text[],
  selected_skin text NOT NULL DEFAULT 'palhaco',
  redeemed_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  best_time_ms integer NOT NULL DEFAULT 0,
  best_time_at timestamptz,
  run_started_at timestamptz,
  influencer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_idx ON public.profiles (lower(username));
CREATE INDEX profiles_best_time_idx ON public.profiles (best_time_ms DESC);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- Skin catalog (price NULL = code-only)
CREATE TABLE public.skins (
  id text PRIMARY KEY,
  price integer
);
GRANT SELECT ON public.skins TO anon, authenticated;
GRANT ALL ON public.skins TO service_role;
ALTER TABLE public.skins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads skins" ON public.skins FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.skins (id, price) VALUES
  ('palhaco', 0), ('coringa', 150), ('gato', 300), ('cachorro', 500), ('superman', NULL),
  ('astronauta', 650), ('ninja', 750), ('robo', 850), ('pirata', 950), ('zumbi', 1050),
  ('rei', 1200), ('samurai', 1350), ('alien', 1500), ('bombeiro', 1650), ('galaxia', 2000);

-- Secret redeem codes (never readable by clients)
CREATE TABLE public.redeem_codes (
  code text PRIMARY KEY,
  skin_id text NOT NULL REFERENCES public.skins(id)
);
GRANT ALL ON public.redeem_codes TO service_role;
ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;
INSERT INTO public.redeem_codes (code, skin_id) VALUES ('vrtnocoin00', 'superman');

-- Global game settings (single row)
CREATE TABLE public.game_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  timer_multiplier integer NOT NULL DEFAULT 100
);
GRANT SELECT ON public.game_settings TO anon, authenticated;
GRANT ALL ON public.game_settings TO service_role;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads settings" ON public.game_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.game_settings (id, timer_multiplier) VALUES (1, 100);

-- Helpers
CREATE OR REPLACE FUNCTION public.player_json(p public.profiles)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'username', p.username, 'coins', p.coins,
    'ownedSkins', to_jsonb(p.owned_skins), 'selectedSkin', p.selected_skin,
    'bestTimeMs', p.best_time_ms, 'influencer', p.influencer)
$$;

CREATE OR REPLACE FUNCTION public.current_player()
RETURNS public.profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  RETURN p;
END $$;
REVOKE EXECUTE ON FUNCTION public.current_player() FROM PUBLIC, anon, authenticated;

-- Public leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (username text, best_time_ms integer, skin text, influencer boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT username, best_time_ms, selected_skin, influencer
  FROM public.profiles WHERE best_time_ms > 0
  ORDER BY best_time_ms DESC, best_time_at ASC NULLS LAST
  LIMIT 25
$$;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;

-- Me + rank
CREATE OR REPLACE FUNCTION public.get_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; r integer;
BEGIN
  p := public.current_player();
  IF p.best_time_ms > 0 THEN
    SELECT count(*)::int + 1 INTO r FROM public.profiles WHERE best_time_ms > p.best_time_ms;
  END IF;
  RETURN jsonb_build_object('player', public.player_json(p), 'rank', r);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.start_run()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  p := public.current_player();
  UPDATE public.profiles SET run_started_at = now() WHERE id = p.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_run() TO authenticated;

-- Finish a run with server-side sanity clamps (anti-cheat)
CREATE OR REPLACE FUNCTION public.finish_run(p_time_ms integer, p_coins integer, p_run_ms integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles; u public.profiles;
  elapsed bigint; mult numeric; t bigint; c bigint; run_ms bigint; max_coins bigint; is_record boolean;
BEGIN
  p := public.current_player();
  IF p.run_started_at IS NULL THEN RAISE EXCEPTION 'Nenhuma corrida em andamento.'; END IF;
  elapsed := floor(extract(epoch FROM (now() - p.run_started_at)) * 1000)::bigint + 3000;
  SELECT timer_multiplier / 100.0 INTO mult FROM public.game_settings WHERE id = 1;
  mult := coalesce(mult, 1);
  run_ms := greatest(0, coalesce(p_run_ms, 0));
  IF run_ms = 0 THEN run_ms := elapsed; END IF;
  t := greatest(0, least(coalesce(p_time_ms, 0)::bigint, floor(elapsed * mult)::bigint, floor(run_ms * mult)::bigint));
  max_coins := ceil(least(run_ms, elapsed) / 1000.0 * 12)::bigint + 5;
  c := greatest(0, least(coalesce(p_coins, 0)::bigint, max_coins));
  is_record := t > p.best_time_ms;
  UPDATE public.profiles SET
    coins = coins + c::int,
    run_started_at = NULL,
    best_time_ms = CASE WHEN is_record THEN t::int ELSE best_time_ms END,
    best_time_at = CASE WHEN is_record THEN now() ELSE best_time_at END
  WHERE id = p.id RETURNING * INTO u;
  RETURN jsonb_build_object('player', public.player_json(u), 'isRecord', is_record, 'timeMs', t, 'coins', c);
END $$;
REVOKE EXECUTE ON FUNCTION public.finish_run(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_run(integer, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_skin(p_skin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; u public.profiles; s public.skins;
BEGIN
  p := public.current_player();
  SELECT * INTO s FROM public.skins WHERE id = p_skin;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personagem inválido.'; END IF;
  IF s.id = ANY(p.owned_skins) THEN RAISE EXCEPTION 'Você já tem esse personagem.'; END IF;
  IF s.price IS NULL THEN RAISE EXCEPTION 'Esse personagem só pode ser desbloqueado com código.'; END IF;
  UPDATE public.profiles SET
    coins = coins - s.price,
    owned_skins = array_append(owned_skins, s.id),
    selected_skin = s.id
  WHERE id = p.id AND coins >= s.price AND NOT (s.id = ANY(owned_skins))
  RETURNING * INTO u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Moedas insuficientes.'; END IF;
  RETURN jsonb_build_object('player', public.player_json(u));
END $$;
REVOKE EXECUTE ON FUNCTION public.buy_skin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_skin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.select_skin(p_skin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; u public.profiles;
BEGIN
  p := public.current_player();
  IF NOT (p_skin = ANY(p.owned_skins)) THEN RAISE EXCEPTION 'Você ainda não desbloqueou esse personagem.'; END IF;
  UPDATE public.profiles SET selected_skin = p_skin WHERE id = p.id RETURNING * INTO u;
  RETURN jsonb_build_object('player', public.player_json(u));
END $$;
REVOKE EXECUTE ON FUNCTION public.select_skin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_skin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; u public.profiles; k text; sk text;
BEGIN
  p := public.current_player();
  k := lower(trim(coalesce(p_code, '')));
  SELECT skin_id INTO sk FROM public.redeem_codes WHERE code = k;
  IF sk IS NULL THEN RAISE EXCEPTION 'Código inválido.'; END IF;
  IF k = ANY(p.redeemed_codes) OR sk = ANY(p.owned_skins) THEN RAISE EXCEPTION 'Você já resgatou esse código.'; END IF;
  UPDATE public.profiles SET
    owned_skins = array_append(owned_skins, sk),
    redeemed_codes = array_append(redeemed_codes, k),
    selected_skin = sk
  WHERE id = p.id RETURNING * INTO u;
  RETURN jsonb_build_object('player', public.player_json(u), 'unlocked', sk);
END $$;
REVOKE EXECUTE ON FUNCTION public.redeem_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_code(text) TO authenticated;

-- Admin-only operations (called from the server after the admin password check)
CREATE OR REPLACE FUNCTION public.admin_add_coins(p_username text, p_amount integer)
RETURNS TABLE (username text, coins integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET coins = profiles.coins + p_amount
  WHERE lower(profiles.username) = lower(p_username)
  RETURNING profiles.username, profiles.coins
$$;
REVOKE EXECUTE ON FUNCTION public.admin_add_coins(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_coins(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_influencer(p_username text, p_enabled boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.profiles SET influencer = p_enabled WHERE lower(username) = lower(p_username);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_influencer(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer(text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.username_taken(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username))
$$;
REVOKE EXECUTE ON FUNCTION public.username_taken(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.username_taken(text) TO service_role;

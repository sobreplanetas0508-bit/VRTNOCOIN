-- Owner tag (display only)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.player_json(p public.profiles)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'username', p.username, 'coins', p.coins,
    'ownedSkins', to_jsonb(p.owned_skins), 'selectedSkin', p.selected_skin,
    'bestTimeMs', p.best_time_ms, 'influencer', p.influencer, 'owner', p.owner)
$$;

DROP FUNCTION IF EXISTS public.get_leaderboard();
CREATE FUNCTION public.get_leaderboard()
RETURNS TABLE (username text, best_time_ms integer, skin text, influencer boolean, owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT username, best_time_ms, selected_skin, influencer, owner
  FROM public.profiles WHERE best_time_ms > 0
  ORDER BY best_time_ms DESC, best_time_at ASC NULLS LAST
  LIMIT 25
$$;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;

-- Multiplayer rooms
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  max_players integer NOT NULL DEFAULT 10 CHECK (max_players BETWEEN 2 AND 10),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'racing')),
  race_id integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.room_players (
  player_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  racing boolean NOT NULL DEFAULT false,
  last_race_id integer,
  last_time_ms integer,
  last_coins integer
);
CREATE INDEX room_players_room_idx ON public.room_players (room_id);
GRANT SELECT ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT SELECT ON public.room_players TO authenticated;
GRANT ALL ON public.room_players TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.my_room_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id FROM public.room_players WHERE player_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.my_room_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_room_id() TO authenticated;

CREATE POLICY "Members read their room" ON public.rooms FOR SELECT TO authenticated
  USING (id = public.my_room_id());
CREATE POLICY "Members read room players" ON public.room_players FOR SELECT TO authenticated
  USING (room_id = public.my_room_id());

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;

-- Internal: remove a player from their room, hand over host, close empty rooms
CREATE OR REPLACE FUNCTION public.room_remove_player(p_player uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; r public.rooms; next_host uuid;
BEGIN
  DELETE FROM public.room_players WHERE player_id = p_player RETURNING room_id INTO rid;
  IF rid IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.rooms WHERE id = rid FOR UPDATE;
  SELECT player_id INTO next_host FROM public.room_players WHERE room_id = rid ORDER BY joined_at LIMIT 1;
  IF next_host IS NULL THEN
    DELETE FROM public.rooms WHERE id = rid;
    RETURN;
  END IF;
  UPDATE public.rooms SET
    host_id = CASE WHEN host_id = p_player THEN next_host ELSE host_id END,
    status = CASE WHEN status = 'racing' AND NOT EXISTS (
      SELECT 1 FROM public.room_players WHERE room_id = rid AND racing) THEN 'waiting' ELSE status END,
    updated_at = now()
  WHERE id = rid;
END $$;
REVOKE EXECUTE ON FUNCTION public.room_remove_player(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_room()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; r public.rooms; host_name text;
BEGIN
  p := public.current_player();
  SELECT rm.* INTO r FROM public.rooms rm JOIN public.room_players rp ON rp.room_id = rm.id WHERE rp.player_id = p.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT username INTO host_name FROM public.profiles WHERE id = r.host_id;
  RETURN jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'hostId', r.host_id, 'hostName', host_name,
      'isPublic', r.is_public, 'maxPlayers', r.max_players, 'status', r.status, 'raceId', r.race_id,
      'startedAt', r.started_at),
    'players', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'username', pr.username, 'skin', pr.selected_skin,
        'influencer', pr.influencer, 'owner', pr.owner, 'racing', rp.racing,
        'lastRaceId', rp.last_race_id, 'lastTimeMs', rp.last_time_ms, 'lastCoins', rp.last_coins)
        ORDER BY rp.joined_at)
      FROM public.room_players rp JOIN public.profiles pr ON pr.id = rp.player_id
      WHERE rp.room_id = r.id), '[]'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION public.get_my_room() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_room() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_open_rooms()
RETURNS TABLE (code text, host_name text, host_influencer boolean, host_owner boolean, players integer, max_players integer, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.code, h.username, h.influencer, h.owner,
    (SELECT count(*)::int FROM public.room_players rp WHERE rp.room_id = r.id), r.max_players, r.status
  FROM public.rooms r JOIN public.profiles h ON h.id = r.host_id
  WHERE r.is_public AND r.updated_at > now() - interval '3 hours'
  ORDER BY r.created_at DESC
  LIMIT 30
$$;
REVOKE EXECUTE ON FUNCTION public.list_open_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_rooms() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_room(p_max_players integer, p_public boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; new_code text; rid uuid; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  p := public.current_player();
  IF p_max_players IS NULL OR p_max_players < 2 OR p_max_players > 10 THEN
    RAISE EXCEPTION 'A sala deve ter de 2 a 10 jogadores.';
  END IF;
  PERFORM public.room_remove_player(p.id);
  LOOP
    new_code := '';
    FOR i IN 1..5 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms WHERE code = new_code);
  END LOOP;
  INSERT INTO public.rooms (code, host_id, is_public, max_players)
    VALUES (new_code, p.id, coalesce(p_public, true), p_max_players) RETURNING id INTO rid;
  INSERT INTO public.room_players (player_id, room_id) VALUES (p.id, rid);
  RETURN public.get_my_room();
END $$;
REVOKE EXECUTE ON FUNCTION public.create_room(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room(integer, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_room(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; r public.rooms; n integer;
BEGIN
  p := public.current_player();
  SELECT * INTO r FROM public.rooms WHERE code = upper(trim(coalesce(p_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada. Confira o código.'; END IF;
  IF EXISTS (SELECT 1 FROM public.room_players WHERE player_id = p.id AND room_id = r.id) THEN
    RETURN public.get_my_room();
  END IF;
  IF r.status <> 'waiting' THEN RAISE EXCEPTION 'A corrida dessa sala já começou. Espere terminar.'; END IF;
  SELECT count(*) INTO n FROM public.room_players WHERE room_id = r.id;
  IF n >= r.max_players THEN RAISE EXCEPTION 'Essa sala está cheia.'; END IF;
  PERFORM public.room_remove_player(p.id);
  INSERT INTO public.room_players (player_id, room_id) VALUES (p.id, r.id);
  UPDATE public.rooms SET updated_at = now() WHERE id = r.id;
  RETURN public.get_my_room();
END $$;
REVOKE EXECUTE ON FUNCTION public.join_room(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_room()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  p := public.current_player();
  PERFORM public.room_remove_player(p.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_room() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_room() TO authenticated;

CREATE OR REPLACE FUNCTION public.start_room_race()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; r public.rooms; n integer;
BEGIN
  p := public.current_player();
  SELECT rm.* INTO r FROM public.rooms rm JOIN public.room_players rp ON rp.room_id = rm.id
    WHERE rp.player_id = p.id FOR UPDATE OF rm;
  IF NOT FOUND THEN RAISE EXCEPTION 'Você não está em uma sala.'; END IF;
  IF r.host_id <> p.id THEN RAISE EXCEPTION 'Só o dono da sala pode começar a corrida.'; END IF;
  IF r.status <> 'waiting' THEN RAISE EXCEPTION 'A corrida já começou.'; END IF;
  SELECT count(*) INTO n FROM public.room_players WHERE room_id = r.id;
  IF n < 2 THEN RAISE EXCEPTION 'Precisa de pelo menos 2 jogadores para começar.'; END IF;
  UPDATE public.room_players SET racing = true WHERE room_id = r.id;
  UPDATE public.rooms SET status = 'racing', race_id = race_id + 1, started_at = now(), updated_at = now()
    WHERE id = r.id;
  RETURN public.get_my_room();
END $$;
REVOKE EXECUTE ON FUNCTION public.start_room_race() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_room_race() TO authenticated;

CREATE OR REPLACE FUNCTION public.end_room_race()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; r public.rooms;
BEGIN
  p := public.current_player();
  SELECT rm.* INTO r FROM public.rooms rm JOIN public.room_players rp ON rp.room_id = rm.id
    WHERE rp.player_id = p.id FOR UPDATE OF rm;
  IF NOT FOUND THEN RAISE EXCEPTION 'Você não está em uma sala.'; END IF;
  IF r.host_id <> p.id THEN RAISE EXCEPTION 'Só o dono da sala pode encerrar a corrida.'; END IF;
  UPDATE public.room_players SET racing = false WHERE room_id = r.id;
  UPDATE public.rooms SET status = 'waiting', updated_at = now() WHERE id = r.id;
  RETURN public.get_my_room();
END $$;
REVOKE EXECUTE ON FUNCTION public.end_room_race() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_room_race() TO authenticated;

-- finish_run now also records the result of a room race
CREATE OR REPLACE FUNCTION public.finish_run(p_time_ms integer, p_coins integer, p_run_ms integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles; u public.profiles;
  elapsed bigint; mult numeric; t bigint; c bigint; run_ms bigint; max_coins bigint; is_record boolean;
  rid uuid;
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

  UPDATE public.room_players rp SET racing = false, last_race_id = rm.race_id, last_time_ms = t::int, last_coins = c::int
    FROM public.rooms rm
    WHERE rp.player_id = p.id AND rp.racing AND rm.id = rp.room_id AND rm.status = 'racing'
    RETURNING rp.room_id INTO rid;
  IF rid IS NOT NULL THEN
    UPDATE public.rooms SET updated_at = now(),
      status = CASE WHEN EXISTS (SELECT 1 FROM public.room_players WHERE room_id = rid AND racing) THEN 'racing' ELSE 'waiting' END
    WHERE id = rid;
  END IF;

  RETURN jsonb_build_object('player', public.player_json(u), 'isRecord', is_record, 'timeMs', t, 'coins', c);
END $$;
REVOKE EXECUTE ON FUNCTION public.finish_run(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_run(integer, integer, integer) TO authenticated;
-- Personal timer speed (NULL = follow the server speed)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timer_multiplier integer;

-- Effective timer speed for the signed-in player (x100)
CREATE OR REPLACE FUNCTION public.my_timer_multiplier()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT timer_multiplier FROM public.profiles WHERE id = auth.uid()),
    (SELECT timer_multiplier FROM public.game_settings WHERE id = 1),
    100)
$$;
REVOKE EXECUTE ON FUNCTION public.my_timer_multiplier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_timer_multiplier() TO authenticated;

-- Admin only: set (or clear with NULL) one player's personal speed
CREATE OR REPLACE FUNCTION public.admin_set_personal_timer(p_username text, p_multiplier integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.profiles SET timer_multiplier = p_multiplier WHERE lower(username) = lower(p_username);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_personal_timer(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_personal_timer(text, integer) TO service_role;

-- finish_run: use the player's personal speed when set, otherwise the server speed
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
  IF p.timer_multiplier IS NOT NULL THEN
    mult := p.timer_multiplier / 100.0;
  ELSE
    SELECT timer_multiplier / 100.0 INTO mult FROM public.game_settings WHERE id = 1;
  END IF;
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

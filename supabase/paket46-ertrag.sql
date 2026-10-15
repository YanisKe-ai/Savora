-- Savora Paket 46: Ertragsart «Gesamtertrag» (servingMode 'total', z. B. 1 Glas, 500 ml) in der Rezeptbibliothek.
-- Rein additiv: ersetzt nur die Bereinigungsfunktion savora_lib_clean; bestehende Veroeffentlichungen bleiben unveraendert.
-- Bisher wurde jeder andere Wert als 'pieces' zu 'portions'. Neu bleibt 'total' samt Bezeichnung erhalten.
create or replace function public.savora_lib_clean(j jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  ttl text; e jsonb; ings jsonb := '[]'::jsonb; steps jsonb := '[]'::jsonb; nm text; amt jsonb; grp text; txt text;
  n_ing int := 0; n_real int := 0; n_step int := 0; srv int; url text; src jsonb;
begin
  if j is null or jsonb_typeof(j) <> 'object' then raise exception 'Ungültiges Rezept.'; end if;
  if octet_length(j::text) > 200000 then raise exception 'Das Rezept ist zu gross.'; end if;
  ttl := public.savora_lib_txt(j->'title', 200);
  if ttl = '' then raise exception 'Das Rezept braucht einen Titel.'; end if;
  srv := public.savora_lib_int(j->'servings', 1, 10000);
  if srv is null then raise exception 'Gib an, wie viel das Rezept ergibt (Portionen oder Stück).'; end if;
  if jsonb_typeof(j->'ingredients') = 'array' then
    if jsonb_array_length(j->'ingredients') > 300 then raise exception 'Zu viele Zutaten (höchstens 300).'; end if;
    for e in select x from jsonb_array_elements(j->'ingredients') x loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      nm := public.savora_lib_txt(e->'name', 300);
      if nm = '' then continue; end if;
      if jsonb_typeof(e->'amount') = 'number' and (e->>'amount')::numeric between 0 and 1000000 then amt := e->'amount';
      else amt := to_jsonb(public.savora_lib_txt(e->'amount', 40)); end if;
      grp := public.savora_lib_txt(e->'group', 100);
      ings := ings || jsonb_build_array(jsonb_build_object('amount', amt, 'unit', public.savora_lib_txt(e->'unit', 40), 'name', nm)
        || case when grp <> '' then jsonb_build_object('group', grp) else '{}'::jsonb end
        || case when e->'isGroupHeader' = 'true'::jsonb then '{"isGroupHeader": true}'::jsonb else '{}'::jsonb end);
      n_ing := n_ing + 1;
      if e->'isGroupHeader' is distinct from 'true'::jsonb then n_real := n_real + 1; end if;   -- fehlendes Feld = echte Zutat (nicht NULL-Logik)
    end loop;
  end if;
  if n_real = 0 then raise exception 'Füge mindestens eine Zutat hinzu.'; end if;
  if jsonb_typeof(j->'steps') = 'array' then
    if jsonb_array_length(j->'steps') > 200 then raise exception 'Zu viele Schritte (höchstens 200).'; end if;
    for e in select x from jsonb_array_elements(j->'steps') x loop
      txt := case when jsonb_typeof(e) = 'object' then public.savora_lib_txt(e->'text', 4000) else public.savora_lib_txt(e, 4000) end;
      if txt = '' then continue; end if;
      steps := steps || jsonb_build_array(jsonb_build_object('text', txt));
      n_step := n_step + 1;
    end loop;
  end if;
  if n_step = 0 then raise exception 'Füge mindestens einen Zubereitungsschritt hinzu.'; end if;
  src := case when jsonb_typeof(j->'source') = 'object' then j->'source' else '{}'::jsonb end;
  url := public.savora_lib_txt(src->'url', 500);
  if url !~ '^https?://[^[:space:]"''<>\\`]+$' then url := ''; end if;
  return jsonb_build_object(
    'v', 1,
    'title', ttl,
    'servings', srv,
    'servingMode', case when j->>'servingMode' in ('pieces', 'total') then j->>'servingMode' else 'portions' end,
    'yieldLabel', case when j->>'servingMode' in ('pieces', 'total') then public.savora_lib_txt(j->'yieldLabel', 40) else '' end,
    'timeMinutes', public.savora_lib_int(j->'timeMinutes', 1, 100000),
    'prepMinutes', public.savora_lib_int(j->'prepMinutes', 1, 100000),
    'cookMinutes', public.savora_lib_int(j->'cookMinutes', 1, 100000),
    'restMinutes', public.savora_lib_int(j->'restMinutes', 1, 100000),
    'difficulty', public.savora_lib_txt(j->'difficulty', 30),
    'diet', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(j->'diet') = 'array' then j->'diet' else '[]'::jsonb end) x
                      where x in ('vegan', 'vegetarisch', 'fleisch', 'fisch')), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(x) from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(j->'categories') = 'array' then j->'categories' else '[]'::jsonb end) x
                      where x ~ '^[a-z0-9-]{1,30}$' limit 12) s), '[]'::jsonb),
    'ingredients', ings,
    'steps', steps,
    'tips', public.savora_lib_txt(j->'tips', 2000),
    'source', jsonb_build_object('url', url, 'text', case when url = '' then public.savora_lib_txt(src->'text', 200) else '' end)
  );
end $$;

revoke all on function public.savora_lib_clean(jsonb) from public, anon, authenticated;

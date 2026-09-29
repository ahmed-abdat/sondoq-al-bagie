-- ════════════════════════════════════════════════════════════════════════════════════════
-- M14 · handover difference is measured at submit (edge-case audit H1).
--
-- The outgoing treasurer counts the money and submits; `submit_handover` stores the app balance of
-- that moment in `computed_balance`. Acceptance used to recompute the balance and book
-- `counted − balance at acceptance`, so every payment confirmed (or expense recorded) between
-- submit and accept became a false «فرق عند التسليم» against the outgoing treasurer.
--
-- Now: difference = counted − balance at submit (what the treasurer saw). Activity after submit
-- is normal fund activity until the term closes at acceptance, so the new term opens with the
-- balance at acceptance (counted + activity since submit), and a closed term's closing balance is
-- the next term's opening balance. Without activity in between nothing changes.
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function app_private.accept_handover(p_id uuid, p_new_term_title text default null) returns smallint
language plpgsql security definer set search_path = '' as $$
declare
  h public.handovers;
  cur public.terms;
  me uuid := auth.uid();
  diff integer;
  next_no smallint;
begin
  perform app_private.require_admin();
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status = 'confirmed' then return h.to_term; end if;
  if h.status <> 'submitted' then perform app_private.fail('handover_not_submitted'); end if;
  if not app_private.is_server() and me in (h.started_by, h.submitted_by) then
    perform app_private.fail('same_person', 'the handover must be accepted by another admin (the incoming one)');
  end if;
  select * into cur from public.terms where number = h.from_term for update;
  if cur.ended_on is not null then perform app_private.fail('no_open_term'); end if;

  perform app_private.set_action('accept_handover');
  -- computed_balance was stored by submit_handover; recompute only for a row submitted without it
  diff := h.counted_balance - coalesce(h.computed_balance, app_private.current_balance());
  if diff <> 0 then
    insert into public.balance_adjustments (term, handover_id, amount, reason, created_by)
    values (cur.number, h.id, diff, 'فرق عند التسليم', me);
  end if;
  next_no := cur.number + 1;
  update public.terms set ended_on = current_date where number = cur.number;
  insert into public.terms (number, title, started_on, opening_balance, created_by)
  values (next_no, coalesce(nullif(btrim(p_new_term_title), ''), 'الدورة ' || next_no), current_date,
          app_private.current_balance(), me);
  update public.handovers
  set status = 'confirmed', accepted_at = now(), accepted_by = me, to_term = next_no,
      computed_balance = coalesce(h.computed_balance, h.counted_balance - diff), difference = diff
  where id = p_id;
  update public.committee set active = false
  where active and not (user_id = any (array_remove(h.carry_over || me, null)));
  return next_no;
end $$;

-- A closed term ends with the money held at acceptance = the next term's opening balance.
create or replace function app_private.public_terms()
returns table (number smallint, title text, started_on date, ended_on date, opening_balance integer,
               closing_balance integer, collected bigint, spent bigint, adjustment bigint)
language sql stable security definer set search_path = '' as $$
  select t.number, t.title, t.started_on, t.ended_on,
         case when t.number = 1 then (select s.opening_balance from public.settings s) else t.opening_balance end,
         (select n.opening_balance from public.terms n where n.number = t.number + 1),
         (select coalesce(sum(a.amount), 0) from public.payment_allocations a join public.payments p on p.id = a.payment_id
          where p.status = 'confirmed' and a.kind in ('months', 'credit')
            and p.paid_on >= t.started_on and (t.ended_on is null or p.paid_on < t.ended_on)),
         (select coalesce(sum(e.amount), 0) from public.expenses e
          where e.cancelled_at is null and e.campaign_id is null
            and e.spent_on >= t.started_on and (t.ended_on is null or e.spent_on < t.ended_on)),
         (select coalesce(sum(b.amount), 0) from public.balance_adjustments b where b.term = t.number)
  from public.terms t
  order by t.number;
$$;

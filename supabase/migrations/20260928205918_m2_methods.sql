-- M2 · wallets the app offers (src/lib/methods.ts). Enum values are only ever added, never removed.
alter type public.payment_method add value if not exists 'click' before 'cash';
alter type public.payment_method add value if not exists 'bim' before 'cash';
alter type public.payment_method add value if not exists 'amanty' before 'cash';
alter type public.payment_method add value if not exists 'bamis' before 'cash';

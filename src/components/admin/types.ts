// PROTOTYPE (throwaway, branch proto/admin): the committee-only admin app, fixtures only.
// Plain serialisable shapes built on the server from the fictional fixtures (data.ts).
import type { Method } from "@/lib/methods";

export type PMember = {
  id: string;
  ref: string; // "A-9"
  group: "A" | "B";
  no: number;
  name: string;
  phone: string | null;
  status: "active" | "exempt" | "left" | "away" | "deceased";
  fee: number; // monthly, MRO
  paid: number[]; // months of this year
  owed: number[]; // late months (due and unpaid)
  notOwed: number[]; // before joining, or not active
  lastReminded: string | null;
};

export type PPayLine = { ref: string; name: string; months: number[] };
export type PPayment = {
  id: string;
  kind: "fees" | "gift";
  status: "pending" | "confirmed" | "cancelled";
  payer: string;
  method: Method;
  amount: number;
  at: string;
  by: string;
  txn: string | null;
  receiptNo: string | null;
  lines: PPayLine[];
  campaign?: string;
};

export type PGift = {
  name: string;
  ref: string | null;
  amount: number;
  at: string;
  method: Method;
};
export type PSpend = { note: string; amount: number; at: string };
export type PCampaign = {
  id: string;
  title: string;
  purpose: string;
  target: number;
  startedOn: string;
  deadline: string | null;
  status: "open" | "closed";
  collected: number;
  spent: number;
  gifts: PGift[];
  spends: PSpend[];
  closedOn?: string;
};

export type PExpense = {
  id: string;
  at: string;
  category: "teaching" | "honoring" | "sports" | "other";
  note: string;
  amount: number;
  campaign: string | null;
};

export type POp =
  | { t: "pay"; id: string; at: string; title: string; sub: string; amount: number }
  | { t: "exp"; id: string; at: string; title: string; sub: string; amount: number }
  | { t: "gift"; id: string; at: string; title: string; sub: string; amount: number };

export type PLevy = {
  id: string;
  title: string;
  purpose: string;
  perMember: number;
  scope: string; // «كل الأعضاء» / «المجموعة أ» / «أعضاء مختارون»
  createdOn: string;
  createdBy: string;
  status: "open" | "closed";
  refs: string[]; // members it is set on
  paidRefs: string[];
};
export type PLog = {
  who: string;
  what: string;
  at: string;
  kind: "pay" | "ok" | "no" | "exp" | "gift" | "edit" | "levy";
};
export type PHist = {
  at: string;
  months: number[];
  amount: number;
  method: Method;
  receiptNo: string | null;
  by: string;
  okBy: string | null;
  state: "confirmed" | "cancelled";
  reason?: string;
  levy?: string;
};

export type PData = {
  today: string;
  year: number;
  due: number; // last due month
  me: { name: string; role: string };
  balance: number;
  opening: number;
  collectedYear: number;
  spentYear: number;
  monthIn: number;
  monthOut: number;
  monthly: { month: number; collected: number; expected: number; spent: number }[];
  members: PMember[];
  pending: PPayment[];
  recent: PPayment[];
  ops: POp[];
  campaigns: PCampaign[];
  expenses: PExpense[];
  accounts: { method: Method; number: string; holder: string; active: boolean }[];
  users: { name: string; role: string; login: string; last: string | null }[];
  prices: Record<string, number>;
  levies: PLevy[];
  log: PLog[];
};

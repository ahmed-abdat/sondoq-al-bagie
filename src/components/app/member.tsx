// What the committee member sheet needs besides the member (server-computed).
/** What the member sheet needs besides the member (server-computed, same for every member). */
export type MemberCtx = {
  year: number;
  dueMonth: number;
  prices: Record<string, number>;
  /** the admin switch «إظهار المبالغ المتأخرة» */
  showOwed: boolean;
};

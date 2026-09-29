// A server action that never throws: a dropped connection, a timeout or an action id the server no
// longer knows (old app after a deploy) becomes { ok: false, code: "network" }, so a screen always
// gets an answer to show and its button stops spinning. useAct() wraps every action with it.
import { failure } from "@/lib/data/errors";
import type { ActionResult } from "@/lib/data/types";

export function safeAct<A extends unknown[], R>(
  fn: (...args: A) => Promise<ActionResult<R>>,
): (...args: A) => Promise<ActionResult<R>> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch {
      return failure("network");
    }
  };
}

import { assertLocalApp, bootstrap, e2eEnv } from "../../supabase/tests/e2e/helpers";

/**
 * Refuse anything but the local stack, then make the committee accounts. The server under test
 * must be a build made with the local env (its bundle is checked), never production.
 */
export default async function globalSetup() {
  e2eEnv();
  await assertLocalApp("http://localhost:3420");
  await bootstrap();
}

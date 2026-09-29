/** Network Information API (Chrome/Android only; absent elsewhere). */
export interface NetworkInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether an optional background download is welcome: not when the user asked the browser to
 * save data, nor on a 2G-class connection. Unknown connection (iPhone, Firefox) → yes.
 */
export function allowsBackgroundDownload(conn: NetworkInfo | undefined): boolean {
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== "2g" && conn.effectiveType !== "slow-2g";
}

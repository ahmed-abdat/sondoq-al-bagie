/** While committee data loads: the title, one plain line saying so, and quiet placeholders. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <header className="bq-page-h">
        <h1>اللجنة</h1>
        <p className="bq-hint" role="status">
          <span className="bq-spin" aria-hidden="true" /> جارٍ فتح صفحة اللجنة…
        </p>
      </header>
      <div className="bq-sec bq-sec-first">
        <div className="bq-skel bq-skel-seg" />
        <div className="bq-queue">
          <div className="bq-skel bq-skel-slip" />
          <div className="bq-skel bq-skel-slip" />
        </div>
      </div>
    </div>
  );
}

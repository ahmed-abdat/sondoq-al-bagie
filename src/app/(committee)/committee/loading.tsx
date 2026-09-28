/** While committee data loads: the page title and quiet placeholders in the page's shape. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="جارٍ التحميل">
      <header className="bq-page-h">
        <h1>اللجنة</h1>
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

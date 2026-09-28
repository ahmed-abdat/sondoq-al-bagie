/** While the committee data loads: the header shape and two quiet placeholder slips. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="جارٍ التحميل">
      <div className="bq-com-head">
        <div className="bq-com-bar">
          <span className="bq-com-title">
            <strong>اللجنة</strong>
          </span>
        </div>
        <div className="bq-skel bq-skel-seg" />
      </div>
      <div className="bq-queue">
        <div className="bq-skel bq-skel-slip" />
        <div className="bq-skel bq-skel-slip" />
      </div>
    </div>
  );
}

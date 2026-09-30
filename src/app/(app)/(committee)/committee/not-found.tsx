import Link from "next/link";

/** An unknown committee address (inside the app shell): plain Arabic and one way back. */
export default function NotFound() {
  return (
    <div className="pa-page">
      <h1>لم نجد هذه الصفحة</h1>
      <p className="pa-lead">ربما تغيّر عنوانها أو حُذفت.</p>
      <Link href="/committee" className="pa-btn pa-btn-primary pa-btn-block">
        إلى الرئيسية
      </Link>
    </div>
  );
}

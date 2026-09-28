import type { Metadata, Viewport } from "next";
import { Alexandria, Noto_Sans_Arabic } from "next/font/google";
import { usingFixtures } from "@/components/app/source";
import { Providers } from "@/components/providers";
import "./globals.css";

const body = Noto_Sans_Arabic({
  variable: "--font-body",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Alexandria({
  variable: "--font-display-face",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "صندوق البقيع",
  description: "صندوق رابطة شباب قرية البقيع: الرسوم والمصاريف بشفافية",
  applicationName: "صندوق البقيع",
  appleWebApp: { capable: true, title: "صندوق البقيع", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#237a3b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {usingFixtures && (
          <p className="bq-demo" role="note">
            بيانات تجريبية — ليست أرقام الصندوق الحقيقية
          </p>
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

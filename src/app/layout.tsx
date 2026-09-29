import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/components/app/site";
import { Alexandria, Noto_Sans_Arabic } from "next/font/google";
import { DemoProvider } from "@/components/app/act";
import { DEMO_BANNER } from "@/components/app/demo";
import { demoMode, usingFixtures } from "@/components/app/source";
import { Providers } from "@/components/providers";
import "./globals.css";

const body = Noto_Sans_Arabic({
  variable: "--font-body",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
});

const display = Alexandria({
  variable: "--font-display-face",
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "800"],
});

const DESCRIPTION = "صندوق رابطة شباب قرية البقيع: الرسوم والمصاريف بشفافية";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "صندوق الرابطة",
  description: DESCRIPTION,
  // the owner keeps the whole site out of search engines; WhatsApp previews still work
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  // WhatsApp link previews
  openGraph: {
    type: "website",
    locale: "ar_MR",
    siteName: "صندوق الرابطة",
    title: "صندوق الرابطة",
    description: DESCRIPTION,
    images: [
      { url: "/icons/icon-512.png", width: 512, height: 512, alt: "شعار رابطة شباب قرية البقيع" },
    ],
  },
  applicationName: "صندوق الرابطة",
  appleWebApp: { capable: true, title: "صندوق الرابطة", statusBarStyle: "default" },
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
            {demoMode ? DEMO_BANNER : "بيانات تجريبية: ليست أرقام الصندوق الحقيقية."}
          </p>
        )}
        <Providers>
          <DemoProvider demo={demoMode}>{children}</DemoProvider>
        </Providers>
      </body>
    </html>
  );
}

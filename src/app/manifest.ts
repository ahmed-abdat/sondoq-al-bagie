import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "";

// Colours come from the logo (see globals.css): splash = page background, bar = primary green.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "صندوق الرابطة",
    short_name: "صندوق الرابطة",
    description: "صندوق الرابطة، رابطة شباب قرية البقيع: الرسوم الشهرية والمصاريف بشفافية",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef2ea",
    theme_color: "#237a3b",
    categories: ["finance", "social"],
    prefer_related_applications: false,
    // lets the page ask Android whether the app is already installed (getInstalledRelatedApps)
    related_applications: [{ platform: "webapp", url: `${SITE}/manifest.webmanifest` }],
    // Android shows these in its richer install sheet, like an app store (pnpm screenshots)
    screenshots: [
      ...(["home", "members", "report"] as const).map((n, i) => ({
        src: `/screenshots/${n}-narrow.jpg`,
        sizes: "1080x1920",
        type: "image/jpeg",
        form_factor: "narrow" as const,
        label: ["الرئيسية: ما في الصندوق ومن دفع", "الأعضاء: حالة كل عضو", "تقرير الصندوق"][i],
      })),
      {
        src: "/screenshots/home-wide.jpg",
        sizes: "1920x1080",
        type: "image/jpeg",
        form_factor: "wide" as const,
        label: "صندوق الرابطة على الحاسوب",
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "الأعضاء",
        short_name: "الأعضاء",
        description: "حالة الرسوم الشهرية لكل عضو",
        url: "/members",
        icons: [{ src: "/icons/shortcut-members.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "اللجنة",
        short_name: "اللجنة",
        description: "تسجيل الدفعات وتأكيدها",
        url: "/committee",
        icons: [{ src: "/icons/shortcut-committee.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}

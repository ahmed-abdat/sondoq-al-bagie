import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "";

// Colours come from the logo (see globals.css): splash = page background, bar = primary green.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "صندوق الرابطة",
    short_name: "صندوق الرابطة",
    description: "صندوق رابطة شباب قرية البقيع، للجنة: الدفعات والمصاريف والتقارير",
    lang: "ar",
    dir: "rtl",
    // the app is the committee's; `id` stays "/" so phones that installed it keep it
    start_url: "/committee",
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
      ...(["home", "members", "reports"] as const).map((n, i) => ({
        src: `/screenshots/${n}-narrow.jpg`,
        sizes: "1080x1920",
        type: "image/jpeg",
        form_factor: "narrow" as const,
        label: [
          "الرئيسية: الصندوق وآخر العمليات",
          "الأعضاء: من دفع ومن عليه متأخرات",
          "تقارير الصندوق",
        ][i],
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
        name: "سجّل دفعة",
        short_name: "سجّل دفعة",
        description: "سجّل دفعة من صورة التحويل أو نقدًا",
        url: "/committee/record",
        icons: [{ src: "/icons/shortcut-record.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}

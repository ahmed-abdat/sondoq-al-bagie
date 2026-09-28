import type { MetadataRoute } from "next";

// Colours come from the logo (see globals.css): splash = page background, bar = primary green.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "صندوق البقيع",
    short_name: "صندوق البقيع",
    description: "صندوق رابطة شباب قرية البقيع: الرسوم الشهرية والمصاريف بشفافية",
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

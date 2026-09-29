import type { MetadataRoute } from "next";

// Owner's choice: the site is hidden from search engines (members' names are public on it).
// Link-preview fetchers stay allowed so a link shared in WhatsApp/Facebook still shows its card.
// No sitemap on purpose. Every response also carries `X-Robots-Tag: noindex` (next.config.ts).
const PREVIEW_BOTS = [
  "facebookexternalhit",
  "Facebot",
  "WhatsApp",
  "TelegramBot",
  "Twitterbot",
  "Slackbot",
  "Discordbot",
  "LinkedInBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: PREVIEW_BOTS, allow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}

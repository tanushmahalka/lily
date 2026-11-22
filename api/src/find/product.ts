import { db, now } from "../lib/db";
import { logEvent } from "../lib/events";
import { json, Type } from "../lib/gemini";
import { setCampaignProduct } from "../core";
import { tregCall } from "./treg";

export type Brand = { name: string; logo_url: string | null; about: string; tone: string; website: string; country: string | null; language: string | null };
export type Product = { title: string; description: string; price: string | null; images: string[]; category: string };

const schema = {
  type: Type.OBJECT,
  properties: {
    brand: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        logo_url: { type: Type.STRING, nullable: true },
        about: { type: Type.STRING },
        tone: { type: Type.STRING },
        country: { type: Type.STRING, nullable: true },
        language: { type: Type.STRING, nullable: true },
      },
      required: ["name", "logo_url", "about", "tone", "country", "language"],
    },
    product: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        price: { type: Type.STRING, nullable: true },
        images: { type: Type.ARRAY, items: { type: Type.STRING } },
        category: { type: Type.STRING },
      },
      required: ["title", "description", "price", "images", "category"],
    },
  },
  required: ["brand", "product"],
};

const host = (u: string | null | undefined) => {
  try { return new URL(u!).host.replace(/^www\./, ""); } catch { return null; }
};

export async function readProduct(url: string, campaignId?: string | null) {
  const out = await tregCall("treg.web.extract", { url });
  const page = out?.pages?.[0] ?? out;
  const text = String(page?.text ?? page?.markdown ?? page?.content ?? "").slice(0, 40_000);
  if (!text.trim()) throw new Error("Couldn't read that page");

  const res = await json<{ brand: Omit<Brand, "website">; product: Product }>({
    schema: schema as any,
    prompt: `You are reading a web page that a marketing manager gave us as "the product" for a creator ad campaign.
The product may be a physical item, software, a service, or an event (then the product is the ticket or registration).
Return the brand (the company behind it) and the product.
- brand.about: 1-2 sentences. brand.tone: a few words describing how the brand talks.
- brand.country: the main country the brand sells to or the event happens in (e.g. "India"), from places, currency or phone codes; null if unclear.
- brand.language: the main language of its audience (e.g. "English", "Hindi"); usually the page's language.
- product.description: 2-3 sentences, including key facts like dates and place for an event.
- product.price: only if the page states it clearly for this product, else null. Never invent one.
- product.category: one or two words (e.g. "skincare", "saas", "event").
- logo_url and images: only absolute URLs that appear in the page text, else null / [].

URL: ${page?.final_url ?? url}
Title: ${page?.title ?? ""}
Description: ${page?.description ?? ""}

Page text:
${text}`,
  });

  const website = new URL(page?.final_url ?? url).origin;
  const brand: Brand = { ...res.brand, website };
  const product: Product = { ...res.product, images: res.product.images ?? [] };

  if (campaignId) {
    setCampaignProduct(campaignId, product); // stores product_json and renames the chat thread (v4 #5)
    logEvent({ campaign_id: campaignId, actor: "lily", type: "product.read", summary: `Read your product page: ${product.title}`, data: { url } });
  }

  const row = db.query("SELECT value_json FROM settings WHERE key = 'brand'").get() as { value_json: string } | null;
  const current = row ? JSON.parse(row.value_json) : null;
  if (!current?.name || host(current.website) !== host(url)) {
    db.query("INSERT INTO settings (key, value_json) VALUES ('brand', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json")
      .run(JSON.stringify(brand));
    logEvent({ campaign_id: campaignId ?? null, actor: "lily", type: "brand.inferred", summary: `Saved your brand as ${brand.name}. You can edit it in Settings`, data: { at: now() } });
  }
  return { brand, product };
}

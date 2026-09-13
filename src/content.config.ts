import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 場次。granularity 決定這一場能不能進「今晚」與「現在」——
// 只給日期的場次判不出 19:00 之後，一律不進（L1-FORMAT §2）。
const session = z.object({
  startAt: z.string(),
  endAt: z.string().optional(),
  granularity: z.enum(['datetime', 'date']),
  onSales: z.boolean().optional(),
  venueNameRaw: z.string().optional(),
  venueId: z.string().optional(),
  venueSlug: z.string().optional(),
  address: z.string().optional(),
  addressPrecision: z.enum(['street', 'district', 'city', 'venue-name-only']).optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
}).passthrough();

// 每個來源給了什麼、哪些欄位被採用、哪些落選。頁面用它渲染「資料來源」區塊。
const source = z.object({
  id: z.string(),
  recordId: z.string(),
  sourceName: z.string().optional(),
  url: z.string().optional(),
  lastVerifiedAt: z.string(),
  provides: z.array(z.string()).default([]),
  rejected: z.record(z.any()).optional(),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/events' }),
  schema: z.object({
    clusterId: z.string(),
    slug: z.string(),
    title: z.string(),
    // category 是對照過的 canonical 值（overrides/category-map.json，每組都有出處），
    // 對不到就沒有這個欄位。categoryRaw 永遠保留來源原始值。
    category: z.string().optional(),
    categoryRaw: z.string().optional(),
    // 來源給的是純文字不是 markdown，所以放 frontmatter 不放內文
    description: z.string().optional(),
    status: z.string().default('scheduled'),
    popularity: z.number().optional(),
    isFree: z.boolean().optional(),
    priceText: z.string().optional(),
    ticketUrl: z.string().optional(),
    minimumAge: z.number().optional(),
    images: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
    performers: z.array(z.object({ nameRaw: z.string(), country: z.string().optional() })).optional(),
    organizers: z.array(z.object({ nameRaw: z.string(), role: z.string().optional() })).optional(),
    sessions: z.array(session).min(1),
    sources: z.array(source),
  }),
});

const venues = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/venues' }),
  schema: z.object({
    venueId: z.string(),
    slug: z.string(),
    name: z.string(),
    // registry＝來自場館名錄；derived＝由活動資料的場地名＋地址＋座標長出來的
    origin: z.enum(['registry', 'derived']),
    city: z.string().optional(),
    district: z.string().optional(),
    address: z.string().optional(),
    addressPrecision: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    buildingId: z.string().optional(),
    eventCount: z.number().default(0),
    eventClusterIds: z.array(z.string()).default([]),
  }),
});

const heritage = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/heritage' }),
  schema: z.object({
    clusterId: z.string(),
    slug: z.string(),
    name: z.string(),
    level: z.string().optional(),
    heritageTypes: z.array(z.object({ code: z.string().optional(), name: z.string().optional() })).optional(),
    categoryRaw: z.string().optional(),
    registeredAt: z.string().optional(),
    govInstitution: z.string().optional(),
    history: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    address: z.string().optional(),
    addressPrecision: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    images: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
    sources: z.array(source),
  }),
});

export const collections = { events, venues, heritage };

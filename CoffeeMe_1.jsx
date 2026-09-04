import React, { useMemo, useState } from "react";
import {
  MapPin, Zap, Armchair, Car, Volume1, Volume2, VolumeX, Star,
  Clock, Search, Coffee, Phone, ChevronDown, X, Wifi, DollarSign, ImageOff,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Real shop data (Norcross / Peachtree Corners / Duluth, GA area).
// Core fields (name, address, coords, rating, hours, phone, price) are real,
// pulled from Google Places. Workability fields (outlets/seating/parking/
// noise) are compiled from public reviews where mentioned; shops without a
// clear mention are marked "not yet reported" — CoffeeMe is meant to fill
// these in over time from real visits, like a community field guide.
// ---------------------------------------------------------------------------

const HOME = { lat: 33.9412, lng: -84.2135 }; // downtown Norcross reference point

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const SHOPS = [
  {
    id: "45south",
    name: "45 South Cafe",
    address: "45 S Peachtree St, Norcross, GA 30071",
    lat: 33.941663, lng: -84.2131,
    rating: 4.4, ratingCount: 728, price: 1,
    phone: "+1 770-409-4009",
    hours: [["Mon","8:00 AM – 4:00 PM"],["Tue","8:00 AM – 4:00 PM"],["Wed","8:00 AM – 4:00 PM"],
             ["Thu","8:00 AM – 4:00 PM"],["Fri","8:00 AM – 4:00 PM"],["Sat","8:00 AM – 4:00 PM"],["Sun","8:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Community favorite for quick meetings and remote work",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["London fog iced tea", "Biscuit sandwich", "Cappuccino"],
    tag: "Neighborhood staple",
  },
  {
    id: "refuge",
    name: "Refuge Coffee Co. Norcross",
    address: "127 S Peachtree St Ste C, Norcross, GA 30071",
    lat: 33.9405226, lng: -84.2138319,
    rating: 4.6, ratingCount: 95, price: 1,
    phone: "+1 404-295-5247",
    hours: [["Mon","Closed"],["Tue","7:30 AM – 3:00 PM"],["Wed","7:30 AM – 3:00 PM"],
             ["Thu","7:30 AM – 3:00 PM"],["Fri","7:30 AM – 3:00 PM"],["Sat","8:30 AM – 5:00 PM"],["Sun","8:30 AM – 5:00 PM"]],
    outlets: "unknown", seating: "Limited indoor seating; outdoor patio available",
    parking: "lot", noise: "quiet",
    wifi: "unknown",
    popular: ["Matcha latte", "Pistachio matcha", "Sesame pastry"],
    tag: "Quiet & small",
  },
  {
    id: "sanyos",
    name: "Sanyos Coffee",
    address: "6409 Jimmy Carter Blvd Ste 400, Norcross, GA 30071",
    lat: 33.9336199, lng: -84.22242639999999,
    rating: 4.6, ratingCount: 271, price: 2,
    phone: "+1 470-886-6119",
    hours: [["Mon","8:00 AM – 6:00 PM"],["Tue","8:00 AM – 6:00 PM"],["Wed","8:00 AM – 6:00 PM"],
             ["Thu","8:00 AM – 7:00 PM"],["Fri","8:00 AM – 7:00 PM"],["Sat","9:00 AM – 7:00 PM"],["Sun","10:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Plush couches and cozy chairs, popular for remote work",
    parking: "lot", noise: "moderate", wifi: "unknown",
    popular: ["Beef empanadas", "Guava & cheese croissant", "Chai tea latte"],
    tag: "Recommended for working",
  },
  {
    id: "ume",
    name: "U&ME Coffee Bakery and Wine",
    address: "3425 Medlock Bridge Rd Site 400b, Peachtree Corners, GA 30092",
    lat: 33.969134, lng: -84.2085997,
    rating: 4.8, ratingCount: 283, price: null,
    phone: "+1 470-359-6972",
    hours: [["Mon","7:00 AM – 6:00 PM"],["Tue","7:00 AM – 6:00 PM"],["Wed","7:00 AM – 6:00 PM"],
             ["Thu","7:00 AM – 6:00 PM"],["Fri","7:00 AM – 7:00 PM"],["Sat","8:00 AM – 7:00 PM"],["Sun","8:00 AM – 6:00 PM"]],
    outlets: "unknown", seating: "Plenty of indoor seating, cozy feel",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Cold brew with dulce de leche", "Latin latte", "Cubano sandwich"],
    tag: "Popular",
  },
  {
    id: "forest",
    name: "Forest Cafe",
    address: "3780 Old Norcross Rd STE109, Duluth, GA 30096",
    lat: 33.9612907, lng: -84.1442545,
    rating: 4.8, ratingCount: 356, price: 1,
    phone: "+1 678-614-0797",
    hours: [["Mon","9:00 AM – 11:00 PM"],["Tue","9:00 AM – 11:00 PM"],["Wed","9:00 AM – 11:00 PM"],
             ["Thu","9:00 AM – 11:00 PM"],["Fri","9:00 AM – 11:00 PM"],["Sat","9:00 AM – 11:00 PM"],["Sun","9:00 AM – 11:00 PM"]],
    outlets: "limited", seating: "Sofa and chair seating; outlets mainly on one side of the room",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Mini fish waffles", "Korean sweet coffee", "Strawberry matcha"],
    tag: "Late-night friendly",
  },
  {
    id: "qamaria",
    name: "Qamaria Yemeni Coffee Co.",
    address: "2645 N Berkeley Lake Rd NW Ste 221, Duluth, GA 30096",
    lat: 33.9758157, lng: -84.1593789,
    rating: 4.6, ratingCount: 217, price: null,
    phone: "+1 470-359-4908",
    hours: [["Mon","12:00 PM – 12:00 AM"],["Tue","12:00 PM – 12:00 AM"],["Wed","12:00 PM – 12:00 AM"],
             ["Thu","12:00 PM – 12:00 AM"],["Fri","10:00 AM – 1:00 AM"],["Sat","10:00 AM – 1:00 AM"],["Sun","10:00 AM – 12:00 AM"]],
    outlets: "unknown", seating: "Studying/hangout friendly, warm ambiance",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Adeni chai", "Qamaria latte", "Mango mousse cake"],
    tag: "Late hours",
  },
  {
    id: "sequel",
    name: "Sequel Coffee Co.",
    address: "3847 Medlock Bridge Rd Suite 120, Peachtree Corners, GA 30092",
    lat: 33.9815305, lng: -84.21325619999999,
    rating: 4.7, ratingCount: 149, price: null,
    phone: "+1 678-288-4007",
    hours: [["Mon","6:00 AM – 4:00 PM"],["Tue","6:00 AM – 4:00 PM"],["Wed","6:00 AM – 4:00 PM"],
             ["Thu","6:00 AM – 4:00 PM"],["Fri","6:00 AM – 4:00 PM"],["Sat","8:00 AM – 4:00 PM"],["Sun","Closed"]],
    outlets: "available", seating: "Gets busy; extra booths for connected co-working members",
    parking: "lot", noise: "moderate", wifi: "unknown",
    popular: ["Seasonal matcha latte", "Cappuccino with cinnamon", "Banana nut muffin"],
    tag: "Recommended for working",
  },
  {
    id: "rothem",
    name: "Cafe Rothem",
    address: "3585 Peachtree Industrial Blvd #128, Duluth, GA 30096",
    lat: 34.0004547, lng: -84.1697446,
    rating: 4.8, ratingCount: 384, price: 1,
    phone: "+1 470-908-2111",
    hours: [["Mon","10:00 AM – 9:00 PM"],["Tue","10:00 AM – 9:00 PM"],["Wed","10:00 AM – 9:00 PM"],
             ["Thu","10:00 AM – 9:00 PM"],["Fri","10:00 AM – 9:00 PM"],["Sat","10:00 AM – 9:00 PM"],["Sun","Closed"]],
    outlets: "unknown", seating: "Inside a bookstore, calm jazz/classical soundtrack, popular for studying",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Iced burnt sugar latte", "Chicken salad sandwich", "Limoncello mascarpone"],
    tag: "Best for focus",
  },
  {
    id: "common",
    name: "Common Coffee & Cocktails",
    address: "5677 Buford Hwy NE Ste 101, Doraville, GA 30340",
    lat: 33.9056111, lng: -84.26992039999999,
    rating: 4.3, ratingCount: 143, price: null,
    phone: "+1 404-759-5977",
    hours: [["Mon","10:00 AM – 10:00 PM"],["Tue","10:00 AM – 10:00 PM"],["Wed","10:00 AM – 10:00 PM"],
             ["Thu","10:00 AM – 10:00 PM"],["Fri","11:00 AM – 11:00 PM"],["Sat","11:00 AM – 11:00 PM"],["Sun","11:00 AM – 11:00 PM"]],
    outlets: "unknown", seating: "Decent seating, stylish dark interior, good for studying or hanging out",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Sheep matcha", "Toasted rice latte", "Rose latte"],
    tag: "Evening hours",
  },
  {
    id: "967",
    name: "967 Coffee Co",
    address: "11235 Alpharetta Hwy Ste 136, Roswell, GA 30076",
    lat: 34.054677999999996, lng: -84.3288494,
    rating: 4.9, ratingCount: 754, price: 1,
    phone: "+1 470-292-3108",
    hours: [["Mon","7:00 AM – 12:00 AM"],["Tue","7:00 AM – 12:00 AM"],["Wed","7:00 AM – 12:00 AM"],
             ["Thu","7:00 AM – 12:00 AM"],["Fri","7:00 AM – 12:00 AM"],["Sat","Open 24 hours"],["Sun","Open 24 hours"]],
    outlets: "unknown", seating: "Zen, spacious, outdoor seating available, great for groups",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Adeni chai", "Pistachio cheesecake", "Yemeni lemonade"],
    tag: "Open 24 hrs (weekends)",
  },
  {
    id: "kin",
    name: "Kin Coffee Co.",
    address: "5352 Peachtree Rd, Chamblee, GA 30341",
    lat: 33.8911638, lng: -84.3020123,
    rating: 4.8, ratingCount: 198, price: null,
    phone: "+1 678-580-3519",
    hours: [["Mon","7:00 AM – 6:00 PM"],["Tue","7:00 AM – 6:00 PM"],["Wed","7:00 AM – 6:00 PM"],
             ["Thu","7:00 AM – 6:00 PM"],["Fri","7:00 AM – 6:00 PM"],["Sat","8:00 AM – 4:00 PM"],["Sun","Closed"]],
    outlets: "available", seating: "Lots of comfortable, practical seating for working",
    parking: "street", noise: "moderate", wifi: "free",
    popular: ["Honey lavender latte", "Gruyère scone", "Caramel latte"],
    tag: "Recommended for working",
  },
  {
    id: "cloudland",
    name: "Cloudland Coffee Company",
    address: "11130 State Bridge Rd Ste. E104, Johns Creek, GA 30022",
    lat: 34.0558194, lng: -84.2290502,
    rating: 5.0, ratingCount: 240, price: null,
    phone: "+1 678-404-5177",
    hours: [["Mon","8:00 AM – 5:00 PM"],["Tue","8:00 AM – 2:00 PM"],["Wed","8:00 AM – 5:00 PM"],
             ["Thu","8:00 AM – 5:00 PM"],["Fri","8:00 AM – 2:00 PM"],["Sat","8:00 AM – 2:00 PM"],["Sun","Closed"]],
    outlets: "unknown", seating: "Small, quaint, sunny window seating with coffee table books",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Dubai chocolate mocha", "Gluten/dairy/soy-free muffins", "Fresh bagels"],
    tag: "Owner-roasted beans",
  },
];

function haversineMiles(a, b) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function getOpenStatus(shop) {
  const now = new Date();
  const todayLabel = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];
  const entry = shop.hours.find(([d]) => d === todayLabel);
  if (!entry) return { open: false, text: "Hours unavailable" };
  const [, range] = entry;
  if (range === "Closed") return { open: false, text: "Closed today" };
  if (range === "Open 24 hours") return { open: true, text: "Open 24 hours" };
  return { open: null, text: range }; // we don't parse exact open/close live, just show range
}

function workScore(shop) {
  let score = 0;
  if (shop.outlets === "available") score += 2;
  if (shop.outlets === "limited") score += 1;
  if (shop.parking === "lot") score += 2;
  if (shop.parking === "street") score += 1;
  if (shop.noise === "quiet") score += 2;
  if (shop.noise === "moderate") score += 1;
  score += shop.rating - 4; // small nudge from rating
  return score;
}

const OUTLET_LABEL = { available: "Outlets available", limited: "Limited outlets", unknown: "Not yet reported" };
const PARKING_LABEL = { lot: "Dedicated lot", street: "Street parking", unknown: "Not yet reported" };
const NOISE_ICON = { quiet: VolumeX, moderate: Volume1, unknown: Volume2 };
const NOISE_LABEL = { quiet: "Quiet", moderate: "Moderate buzz", unknown: "Not yet reported" };

// Real photos would come from the Google Places Photo API in production (needs
// an API key this prototype doesn't have). Until then, each shop gets a
// generated placeholder so the layout and interaction are real even if the
// image isn't.
const ART_PALETTES = [
  ["#e8a33d", "#b5651d"],
  ["#7a8b6f", "#4a5b3f"],
  ["#c46a4f", "#8a4030"],
  ["#3d6b6b", "#254040"],
  ["#a8823d", "#6b4f1f"],
];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function ShopArt({ shop, height = 96 }) {
  const [c1, c2] = ART_PALETTES[hashStr(shop.id) % ART_PALETTES.length];
  const gradId = `grad-${shop.id}`;
  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ height }}>
      <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect width="400" height="120" fill={`url(#${gradId})`} />
        <circle cx="340" cy="30" r="46" fill="#ffffff" opacity="0.08" />
        <circle cx="60" cy="100" r="60" fill="#000000" opacity="0.1" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Coffee size={height > 80 ? 30 : 20} className="text-white/70" />
      </div>
      <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[9px] text-white/70 font-mono bg-black/20 px-1.5 py-0.5 rounded">
        <ImageOff size={9} /> placeholder
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[#4a423a] text-[#e9dfd0]",
    good: "bg-[#5c6b4f] text-[#eef2e6]",
    warn: "bg-[#8a6a3a] text-[#f5e9d3]",
    quiet: "bg-[#3d4a52] text-[#dceaf0]",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function TicketStub({ shop, distance, expanded, onToggle }) {
  const status = getOpenStatus(shop);
  const NoiseIcon = NOISE_ICON[shop.noise] || Volume2;
  const priceLabel = shop.price ? "$".repeat(shop.price) + " · Affordable" : "Pricing not listed";
  const [tab, setTab] = useState("overview");
  const hasPhotos = shop.photos && shop.photos.length > 0;
  const hasSpecials = shop.specials && shop.specials.length > 0;

  return (
    <div
      className={`w-full relative rounded-xl border transition-all duration-150 overflow-hidden
        ${expanded ? "border-[#e8a33d] bg-[#3a332c] shadow-[0_0_0_1px_#e8a33d]" : "border-[#4a423a] bg-[#2f2a25] hover:border-[#6b6055]"}`}
    >
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between px-4 pt-3 pb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#f0e9de] truncate" style={{ fontFamily: "'Fraunces', serif" }}>
                {shop.name}
              </h3>
            </div>
            <p className="text-xs text-[#a89a89] mt-0.5 truncate">{shop.address}</p>
          </div>
          <div className="flex items-start gap-2 shrink-0 ml-2">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-[#e8a33d] text-sm font-mono">
                <Star size={13} fill="#e8a33d" strokeWidth={0} />
                {shop.rating.toFixed(1)}
              </div>
              <span className="text-[10px] text-[#8c8175] font-mono">{distance.toFixed(1)} mi</span>
            </div>
            <ChevronDown
              size={16}
              className={`text-[#8c8175] mt-0.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* perforation */}
        <div className="relative h-0 border-t border-dashed border-[#5a5147] mx-4">
          <div className="absolute -left-6 -top-2 w-4 h-4 rounded-full bg-[#231f1b]" />
          <div className="absolute -right-6 -top-2 w-4 h-4 rounded-full bg-[#231f1b]" />
        </div>

        <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className={`flex items-center gap-1 text-[11px] font-mono ${shop.outlets === "available" ? "text-[#8ab26a]" : "text-[#8c8175]"}`}>
            <Zap size={12} /> {OUTLET_LABEL[shop.outlets] || "Limited outlets"}
          </span>
          <span className={`flex items-center gap-1 text-[11px] font-mono ${shop.parking !== "unknown" ? "text-[#8ab26a]" : "text-[#8c8175]"}`}>
            <Car size={12} /> {PARKING_LABEL[shop.parking] || "Street parking"}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#8c8175]">
            <NoiseIcon size={12} /> {NOISE_LABEL[shop.noise]}
          </span>
        </div>

        <div className="px-4 pb-3 flex items-center justify-between">
          <Pill tone={shop.tag.startsWith("Recommended") ? "good" : "neutral"}>{shop.tag}</Pill>
          <span className="text-[10px] font-mono text-[#8c8175]">{status.text}</span>
        </div>
      </button>

      {/* Expanded detail */}
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#4a423a] px-4 pt-3 pb-4">

            {/* Tab bar */}
            <div className="flex items-center gap-1 mb-3 bg-[#231f1b] rounded-lg p-1 w-fit">
              {[
                { key: "overview", label: "Overview" },
                { key: "photos", label: "Photos" },
                { key: "menu", label: "Menu" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={(e) => { e.stopPropagation(); setTab(t.key); }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors
                    ${tab === t.key ? "bg-[#e8a33d] text-[#231f1b]" : "text-[#8c8175] hover:text-[#e9dfd0]"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-2 text-xs text-[#e9dfd0]">
                    <DollarSign size={13} className="text-[#8c8175]" /> {priceLabel}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#e9dfd0]">
                    <Phone size={13} className="text-[#8c8175]" /> {shop.phone}
                  </div>
                </div>

                <p className="text-sm text-[#c4b9a9] leading-relaxed mb-3">{shop.seating}</p>

                <h4 className="text-[10px] uppercase tracking-widest text-[#8c8175] mb-1.5 font-mono">Hours this week</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {shop.hours.map(([day, range]) => (
                    <div key={day} className="flex justify-between text-[#c4b9a9] font-mono text-[11px]">
                      <span className="text-[#8c8175]">{day}</span>
                      <span>{range}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "photos" && (
              <div>
                {hasPhotos ? (
                  <div className="grid grid-cols-3 gap-2">
                    {shop.photos.map((src, i) => (
                      <img key={i} src={src} alt={`${shop.name} photo ${i + 1}`}
                        className="w-full h-20 object-cover rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div>
                    <ShopArt shop={shop} height={110} />
                    <p className="text-[11px] text-[#8c8175] italic mt-2 leading-relaxed">
                      No real photos loaded for this shop yet. In production this pulls from the Google
                      Places Photo API (drop image URLs into <code className="text-[#a89a89]">shop.photos</code>),
                      with a community "Add a photo" upload as a fallback for shops with thin coverage.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "menu" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] uppercase tracking-widest text-[#8c8175] font-mono">Menu</h4>
                  <Pill tone="warn">Community-sourced</Pill>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {shop.popular.map((item) => (
                    <span key={item} className="text-[11px] bg-[#2f2a25] text-[#e9dfd0] px-2.5 py-1 rounded-full">{item}</span>
                  ))}
                </div>

                <h4 className="text-[10px] uppercase tracking-widest text-[#8c8175] mb-1.5 font-mono">Specials</h4>
                {hasSpecials ? (
                  <ul className="space-y-1 mb-3">
                    {shop.specials.map((sp) => (
                      <li key={sp} className="text-sm text-[#c4b9a9]">{sp}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#8c8175] mb-3">No specials reported yet.</p>
                )}

                <p className="text-[11px] text-[#8c8175] italic leading-relaxed">
                  Prices aren't shown because no official source is connected yet. In production this tab
                  would pull structured items + prices from the shop's Square/Toast/Clover catalog (if they
                  use one), or from menu details a shop owner enters directly — same pattern the outlet and
                  parking fields already use.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function CoffeeMe() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState({ outlets: false, parking: false, quiet: false });
  const [expandedId, setExpandedId] = useState(SHOPS[0].id);

  const enriched = useMemo(() => {
    return SHOPS.map((s) => ({ ...s, distance: haversineMiles(HOME, s), score: workScore(s) }));
  }, []);

  const filtered = useMemo(() => {
    let list = enriched.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.address.toLowerCase().includes(query.toLowerCase())
    );
    if (filters.outlets) list = list.filter((s) => s.outlets === "available");
    if (filters.parking) list = list.filter((s) => s.parking === "lot" || s.parking === "street");
    if (filters.quiet) list = list.filter((s) => s.noise === "quiet");

    if (sort === "distance") list = [...list].sort((a, b) => a.distance - b.distance);
    else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    else list = [...list].sort((a, b) => b.score - a.score);

    return list;
  }, [enriched, query, filters, sort]);

  return (
    <div className="min-h-screen bg-[#231f1b] text-[#e9dfd0]" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      {/* Header */}
      <header className="border-b border-[#3a332c] px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#e8a33d] flex items-center justify-center">
            <Coffee size={18} className="text-[#231f1b]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#f0e9de]" style={{ fontFamily: "'Fraunces', serif" }}>CoffeeMe</h1>
            <p className="text-[11px] text-[#8c8175] -mt-0.5">Find your next office. It takes cream and sugar.</p>
          </div>
        </div>
        <span className="text-xs font-mono text-[#8c8175] hidden sm:block">Norcross, GA</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8175]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shops or streets..."
              className="w-full bg-[#2f2a25] border border-[#4a423a] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[#e9dfd0] placeholder-[#6b6055] outline-none focus:border-[#e8a33d]"
            />
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {[
              { key: "recommended", label: "Recommended" },
              { key: "distance", label: "Nearest" },
              { key: "rating", label: "Top rated" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors
                  ${sort === opt.key ? "bg-[#e8a33d] text-[#231f1b] border-[#e8a33d]" : "border-[#4a423a] text-[#a89a89] hover:border-[#6b6055]"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {[
              { key: "outlets", label: "Outlets", icon: Zap },
              { key: "parking", label: "Has parking", icon: Car },
              { key: "quiet", label: "Quiet", icon: VolumeX },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border font-mono
                  ${filters[key] ? "bg-[#5c6b4f] border-[#5c6b4f] text-[#eef2e6]" : "border-[#4a423a] text-[#8c8175] hover:border-[#6b6055]"}`}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-[#6b6055] mb-3 font-mono">{filtered.length} spots · sorted by {sort}</p>

          <div className="space-y-3">
            {filtered.map((shop) => (
              <TicketStub
                key={shop.id}
                shop={shop}
                distance={shop.distance}
                expanded={expandedId === shop.id}
                onToggle={() => setExpandedId((cur) => (cur === shop.id ? null : shop.id))}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[#8c8175] py-8 text-center">No shops match those filters yet.</p>
            )}
          </div>
        </div>
      </div>

      <footer className="px-6 py-6 text-center text-[11px] text-[#6b6055] font-mono">
        Data compiled from public listings & reviews near Norcross, GA · Work-setup details are community-reported and may not be current
      </footer>
    </div>
  );
}

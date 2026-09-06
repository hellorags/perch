import React, { useMemo, useState } from "react";
import {
  MapPin, Zap, Armchair, Car, Volume1, Volume2, VolumeX, Star,
  Clock, Search, Coffee, Phone, ChevronDown, X, Wifi, DollarSign, ImageOff, Heart,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Real shop data (Norcross / Peachtree Corners / Duluth, GA area).
// Core fields (name, address, coords, rating, hours, phone, price) are real,
// pulled from Google Places. Workability fields (outlets/seating/parking/
// noise) are compiled from public reviews where mentioned; shops without a
// clear mention are marked "not yet reported" — Perch is meant to fill
// these in over time from real visits, like a community field guide.
// ---------------------------------------------------------------------------

// Each supported city gets real shop data *and* its own accent color — so
// switching cities re-tints the whole app, not just the shop list.
const CITIES = {
  norcross: { key: "norcross", label: "Norcross, GA", aliases: ["norcross", "norcross ga", "atlanta", "30071"], lat: 33.9412, lng: -84.2135, accent: "#E8562E" },
  austin:   { key: "austin",   label: "Austin, TX",   aliases: ["austin", "austin tx", "atx"],                   lat: 30.2672, lng: -97.7431, accent: "#1EA896" },
  seattle:  { key: "seattle",  label: "Seattle, WA",  aliases: ["seattle", "seattle wa"],                        lat: 47.6062, lng: -122.3321, accent: "#4C6FEF" },
  chicago:  { key: "chicago",  label: "Chicago, IL",  aliases: ["chicago", "chicago il", "chi"],                 lat: 41.8781, lng: -87.6298, accent: "#9B4FE8" },
};
const CITY_LIST = Object.values(CITIES);

function findCity(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return CITY_LIST.find((c) => c.aliases.some((a) => a === q || a.includes(q) || q.includes(a))) || null;
}

// ---------------------------------------------------------------------------
// Live nationwide search via Google Places API (New).
// Requires VITE_GOOGLE_PLACES_API_KEY in a local .env file (see README).
// Without a key, the app still works — it just falls back to the four
// curated cities above instead of live results for anywhere else.
// ---------------------------------------------------------------------------
const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY || "";
const LIVE_ACCENT = "#1E8F73"; // distinct teal so it's visually obvious you're in "live API" mode

const DAY_ABBR = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

function parseWeekdayDescriptions(descriptions) {
  if (!descriptions || descriptions.length === 0) {
    return DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map((d) => [DAY_ABBR[d], "Hours not listed"]);
  }
  return descriptions.map((line) => {
    const [dayFull, ...rest] = line.split(": ");
    return [DAY_ABBR[dayFull] || dayFull.slice(0, 3), rest.join(": ") || "Hours not listed"];
  });
}

function mapPriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? null;
}

async function searchLivePlaces(cityText) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("No Google Places API key configured (VITE_GOOGLE_PLACES_API_KEY missing).");
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": [
        "places.id", "places.displayName", "places.formattedAddress", "places.location",
        "places.rating", "places.userRatingCount", "places.priceLevel",
        "places.regularOpeningHours", "places.internationalPhoneNumber", "places.photos",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `coffee shops good for working in ${cityText}`,
      maxResultCount: 12,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Places API request failed (${res.status}).`);
  }

  const data = await res.json();
  const places = data.places || [];

  return places.map((p) => ({
    id: p.id,
    city: "live",
    name: p.displayName?.text || "Unnamed shop",
    address: p.formattedAddress || "Address not listed",
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? 0,
    price: mapPriceLevel(p.priceLevel),
    phone: p.internationalPhoneNumber || "Not listed",
    hours: parseWeekdayDescriptions(p.regularOpeningHours?.weekdayDescriptions),
    outlets: "unknown",
    parking: "unknown",
    noise: "unknown",
    wifi: "unknown",
    seating: "No community details reported for this live result yet — be the first to add one.",
    popular: [],
    specials: [],
    tag: "Live result",
    photos: (p.photos || []).slice(0, 3).map(
      (photo) => `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=600&key=${GOOGLE_PLACES_API_KEY}`
    ),
  }));
}

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const SHOPS = [
  {
    id: "45south", city: "norcross",
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
    id: "refuge", city: "norcross",
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
    id: "sanyos", city: "norcross",
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
    id: "ume", city: "norcross",
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
    id: "forest", city: "norcross",
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
    id: "qamaria", city: "norcross",
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
    id: "sequel", city: "norcross",
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
    id: "rothem", city: "norcross",
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
    id: "common", city: "norcross",
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
    id: "967", city: "norcross",
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
    id: "kin", city: "norcross",
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
    id: "cloudland", city: "norcross",
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

  // --- Austin, TX ---
  {
    id: "austin-flora", city: "austin",
    name: "Flora Coffee & Culture",
    address: "3300 W Anderson Ln. Ste 300, Austin, TX 78757",
    lat: 30.362347, lng: -97.7421123,
    rating: 4.9, ratingCount: 399, price: 1,
    phone: "Not listed",
    hours: [["Mon","7:00 AM – 3:00 PM"],["Tue","7:00 AM – 3:00 PM"],["Wed","7:00 AM – 3:00 PM"],
             ["Thu","7:00 AM – 3:00 PM"],["Fri","7:00 AM – 3:00 PM"],["Sat","7:00 AM – 3:00 PM"],["Sun","8:30 AM – 3:00 PM"]],
    outlets: "unknown", seating: "Cute, small, and passionate about coffee — cozy peaceful vibe",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Black sesame latte", "Strawberry lavender latte", "Croissants"],
    tag: "Quiet & small",
  },
  {
    id: "austin-mozarts", city: "austin",
    name: "Mozart's Coffee Roasters",
    address: "3825 Lake Austin Blvd, Austin, TX 78703",
    lat: 30.2954696, lng: -97.7839512,
    rating: 4.5, ratingCount: 10883, price: null,
    phone: "+1 512-477-2900",
    hours: [["Mon","7:00 AM – 12:00 AM"],["Tue","7:00 AM – 12:00 AM"],["Wed","7:00 AM – 12:00 AM"],
             ["Thu","7:00 AM – 12:00 AM"],["Fri","7:00 AM – 12:00 AM"],["Sat","7:00 AM – 12:00 AM"],["Sun","7:00 AM – 12:00 AM"]],
    outlets: "unknown", seating: "Lakeside patio seating, atmosphere great for studying or working",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Drip coffee", "Fresh pastries", "Brownie"],
    tag: "Lake view",
  },
  {
    id: "austin-epoch", city: "austin",
    name: "Epoch Coffee",
    address: "221 W N Loop Blvd, Austin, TX 78751",
    lat: 30.3186037, lng: -97.7245402,
    rating: 4.5, ratingCount: 2521, price: 1,
    phone: "+1 512-454-3762",
    hours: [["Mon","12:00 AM – 11:30 PM"],["Tue","Open 24 hours"],["Wed","Open 24 hours"],
             ["Thu","Open 24 hours"],["Fri","Open 24 hours"],["Sat","Open 24 hours"],["Sun","Open 24 hours"]],
    outlets: "unknown", seating: "Plenty of indoor and outdoor seating, classic Austin hipster vibe",
    parking: "lot", noise: "moderate", wifi: "unknown",
    popular: ["Cappuccino", "Latte", "Pastries"],
    tag: "Open 24/7",
  },
  {
    id: "austin-luckylab", city: "austin",
    name: "Lucky Lab Coffee Co.",
    address: "2421 San Antonio St, Austin, TX 78705",
    lat: 30.2885615, lng: -97.7420686,
    rating: 4.4, ratingCount: 646, price: 2,
    phone: "+1 512-420-6950",
    hours: [["Mon","6:30 AM – 7:00 PM"],["Tue","6:30 AM – 7:00 PM"],["Wed","6:30 AM – 7:00 PM"],
             ["Thu","6:30 AM – 7:00 PM"],["Fri","6:30 AM – 7:00 PM"],["Sat","7:00 AM – 7:00 PM"],["Sun","7:00 AM – 7:00 PM"]],
    outlets: "unknown", seating: "Great indoor and outdoor seating, table service",
    parking: "street", noise: "moderate", wifi: "unknown",
    popular: ["Cold foam cold brew", "Iced tea", "Artichoke salad"],
    tag: "Popular",
  },
  {
    id: "austin-afuga", city: "austin",
    name: "Afuga Coffee",
    address: "31 Navasota St Ste 100, Austin, TX 78702",
    lat: 30.2529632, lng: -97.7323939,
    rating: 4.8, ratingCount: 746, price: 1,
    phone: "+1 512-640-1640",
    hours: [["Mon","7:00 AM – 7:00 PM"],["Tue","7:00 AM – 7:00 PM"],["Wed","7:00 AM – 7:00 PM"],
             ["Thu","7:00 AM – 7:00 PM"],["Fri","7:00 AM – 7:00 PM"],["Sat","7:00 AM – 7:00 PM"],["Sun","7:00 AM – 7:00 PM"]],
    outlets: "unknown", seating: "Colorful indoor and outdoor seating near the hike-and-bike trail",
    parking: "lot", noise: "quiet", wifi: "unknown",
    popular: ["Mushroom blend coffee", "Maple pecan latte", "Baked goods"],
    tag: "Neighborhood staple",
  },
  {
    id: "austin-spokesman", city: "austin",
    name: "Spokesman Coffee",
    address: "440 E St Elmo Rd A2, Austin, TX 78745",
    lat: 30.2155763, lng: -97.7624548,
    rating: 4.7, ratingCount: 1108, price: 2,
    phone: "+1 512-586-9657",
    hours: [["Mon","7:00 AM – 7:00 PM"],["Tue","7:00 AM – 7:00 PM"],["Wed","7:00 AM – 9:00 PM"],
             ["Thu","7:00 AM – 9:00 PM"],["Fri","7:00 AM – 9:00 PM"],["Sat","8:00 AM – 7:00 PM"],["Sun","8:00 AM – 7:00 PM"]],
    outlets: "available", seating: "Tons of tables and seats, nearly every seat near an outlet",
    parking: "lot", noise: "moderate", wifi: "unknown",
    popular: ["Chaider", "Blueberry basil latte", "Brisket & cheddar kolache"],
    tag: "Recommended for working",
  },

  // --- Seattle, WA ---
  {
    id: "seattle-piedmont", city: "seattle",
    name: "Piedmont Café",
    address: "1215 Seneca St Ste 100, Seattle, WA 98101",
    lat: 47.6115511, lng: -122.3242818,
    rating: 4.8, ratingCount: 300, price: 2,
    phone: "+1 206-659-9899",
    hours: [["Mon","7:00 AM – 5:00 PM"],["Tue","7:00 AM – 5:00 PM"],["Wed","7:00 AM – 5:00 PM"],
             ["Thu","7:00 AM – 5:00 PM"],["Fri","7:00 AM – 5:00 PM"],["Sat","8:00 AM – 5:00 PM"],["Sun","8:00 AM – 5:00 PM"]],
    outlets: "unknown", seating: "Historic hotel lobby, vaulted ceilings, warm and homey",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Berry chocolate muffin", "Drip coffee", "Savory rolls"],
    tag: "Historic building",
  },
  {
    id: "seattle-url", city: "seattle",
    name: "URL Coffee",
    address: "524 Broadway, Seattle, WA 98122",
    lat: 47.6067021, lng: -122.3205144,
    rating: 4.8, ratingCount: 453, price: 2,
    phone: "Not listed",
    hours: [["Mon","7:00 AM – 4:00 PM"],["Tue","7:00 AM – 4:00 PM"],["Wed","7:00 AM – 4:00 PM"],
             ["Thu","7:00 AM – 4:00 PM"],["Fri","7:00 AM – 4:00 PM"],["Sat","8:00 AM – 3:00 PM"],["Sun","8:00 AM – 3:00 PM"]],
    outlets: "unknown", seating: "Cozy mom-and-pop cafe, minimalist vibe",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["London fog", "Avocado toast", "Sardine toast"],
    tag: "Popular",
  },
  {
    id: "seattle-nudibranch", city: "seattle",
    name: "Nudibranch Coffee",
    address: "1400 12th Ave, Seattle, WA 98122",
    lat: 47.6130694, lng: -122.3166167,
    rating: 4.7, ratingCount: 130, price: 1,
    phone: "+1 206-566-6684",
    hours: [["Mon","7:00 AM – 5:00 PM"],["Tue","7:00 AM – 5:00 PM"],["Wed","7:00 AM – 5:00 PM"],
             ["Thu","7:00 AM – 5:00 PM"],["Fri","7:00 AM – 5:00 PM"],["Sat","7:00 AM – 5:00 PM"],["Sun","7:00 AM – 5:00 PM"]],
    outlets: "unknown", seating: "Thai-inspired interior with a back room, lots of laptop workers",
    parking: "unknown", noise: "quiet", wifi: "free",
    popular: ["Thai coffee", "Mango matcha", "Jasmine latte"],
    tag: "Great wifi",
  },
  {
    id: "seattle-outerrim", city: "seattle",
    name: "The Outer Rim",
    address: "2821 Thorndyke Ave W, Seattle, WA 98119",
    lat: 47.6454652, lng: -122.3831305,
    rating: 4.8, ratingCount: 202, price: 1,
    phone: "+1 206-556-6130",
    hours: [["Mon","7:00 AM – 3:00 PM"],["Tue","7:00 AM – 3:00 PM"],["Wed","7:00 AM – 3:00 PM"],
             ["Thu","7:00 AM – 3:00 PM"],["Fri","7:00 AM – 3:00 PM"],["Sat","8:00 AM – 4:00 PM"],["Sun","8:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Small sci-fi themed shop, comfortable chairs and one couch",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Tracker Beam latte", "Cold brew", "Macrina Bakery pastries"],
    tag: "Recommended for working",
  },
  {
    id: "seattle-storyville", city: "seattle",
    name: "Storyville Coffee Pike Place",
    address: "94 Pike St Top floor Suite 34, Seattle, WA 98101",
    lat: 47.60895, lng: -122.3404309,
    rating: 4.6, ratingCount: 3168, price: 2,
    phone: "+1 206-780-5777",
    hours: [["Mon","6:59 AM – 5:00 PM"],["Tue","6:59 AM – 5:00 PM"],["Wed","6:59 AM – 5:00 PM"],
             ["Thu","6:59 AM – 5:00 PM"],["Fri","6:59 AM – 6:00 PM"],["Sat","6:59 AM – 6:00 PM"],["Sun","6:59 AM – 6:00 PM"]],
    outlets: "unknown", seating: "Cozy but small, view overlooking Pike Place Market",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Dark mocha", "Cinnamon scroll", "Americano"],
    tag: "Tourist favorite",
  },
  {
    id: "seattle-daymade", city: "seattle",
    name: "Day Made Kaffe Bar",
    address: "524 1st Ave S, Seattle, WA 98104",
    lat: 47.5976302, lng: -122.3337929,
    rating: 4.8, ratingCount: 148, price: 1,
    phone: "+1 206-806-0789",
    hours: [["Mon","7:00 AM – 4:00 PM"],["Tue","7:00 AM – 4:00 PM"],["Wed","7:00 AM – 7:00 PM"],
             ["Thu","7:00 AM – 7:00 PM"],["Fri","7:00 AM – 7:00 PM"],["Sat","8:00 AM – 2:00 PM"],["Sun","Closed"]],
    outlets: "unknown", seating: "Quiet and surprisingly spacious, modern but inviting",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Cortado", "Cardamom bun", "Pour over"],
    tag: "Best for focus",
  },

  // --- Chicago, IL ---
  {
    id: "chicago-tasa", city: "chicago",
    name: "Tasa Coffee Roasters",
    address: "4136 W North Ave, Chicago, IL 60639",
    lat: 41.9101399, lng: -87.7302478,
    rating: 4.9, ratingCount: 573, price: 2,
    phone: "+1 872-275-6258",
    hours: [["Mon","7:00 AM – 2:00 PM"],["Tue","7:00 AM – 3:00 PM"],["Wed","7:00 AM – 3:00 PM"],
             ["Thu","7:00 AM – 3:00 PM"],["Fri","7:00 AM – 3:00 PM"],["Sat","8:00 AM – 3:00 PM"],["Sun","8:00 AM – 3:00 PM"]],
    outlets: "unknown", seating: "Clean, new, and quiet space with a pleasant atmosphere",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Avocado toast", "Shamrock latte", "Empanadas"],
    tag: "Quiet & new",
  },
  {
    id: "chicago-hexe", city: "chicago",
    name: "Hexe Coffee Co.",
    address: "2000 W Diversey Pkwy, Chicago, IL 60614",
    lat: 41.9325695, lng: -87.6790478,
    rating: 4.8, ratingCount: 1031, price: 2,
    phone: "+1 773-904-7702",
    hours: [["Mon","7:30 AM – 8:00 PM"],["Tue","7:30 AM – 8:00 PM"],["Wed","7:30 AM – 8:00 PM"],
             ["Thu","7:30 AM – 8:00 PM"],["Fri","7:30 AM – 8:00 PM"],["Sat","7:30 AM – 8:00 PM"],["Sun","7:30 AM – 8:00 PM"]],
    outlets: "available", seating: "Plenty of seating options, indoor and outdoor, modern layout",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Pimento cheese croissant", "Iced latte", "Funfetti cookie"],
    tag: "Recommended for working",
  },
  {
    id: "chicago-magnifico", city: "chicago",
    name: "Magnífico Coffee Roasters",
    address: "3063 N Milwaukee Ave, Chicago, IL 60618",
    lat: 41.9369512, lng: -87.7200448,
    rating: 4.9, ratingCount: 477, price: null,
    phone: "+1 773-216-8279",
    hours: [["Mon","Closed"],["Tue","7:00 AM – 4:00 PM"],["Wed","7:00 AM – 4:00 PM"],
             ["Thu","7:00 AM – 4:00 PM"],["Fri","7:00 AM – 4:00 PM"],["Sat","7:00 AM – 4:00 PM"],["Sun","7:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Roastery with community vibe, occasional live DJ sets on weekends",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Pan de bono", "Colombian pastries", "House-roasted coffee"],
    tag: "Popular",
  },
  {
    id: "chicago-ludlow", city: "chicago",
    name: "Ludlow Charlingtons Coffee Shop",
    address: "2425 N Clark St, Chicago, IL 60614",
    lat: 41.9262858, lng: -87.6407508,
    rating: 4.8, ratingCount: 355, price: 1,
    phone: "+1 773-697-7984",
    hours: [["Mon","7:00 AM – 4:00 PM"],["Tue","7:00 AM – 4:00 PM"],["Wed","7:00 AM – 4:00 PM"],
             ["Thu","7:00 AM – 4:00 PM"],["Fri","7:00 AM – 4:00 PM"],["Sat","7:00 AM – 5:00 PM"],["Sun","7:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Cozy and quiet, dog-friendly neighborhood spot",
    parking: "unknown", noise: "quiet", wifi: "unknown",
    popular: ["Vanilla iced coffee", "Croissant", "Chai tea"],
    tag: "Quiet & cozy",
  },
  {
    id: "chicago-overflow", city: "chicago",
    name: "Overflow Coffee",
    address: "1449 S Michigan Ave, Chicago, IL 60605",
    lat: 41.8626801, lng: -87.6236051,
    rating: 4.6, ratingCount: 517, price: 1,
    phone: "+1 312-283-0066",
    hours: [["Mon","7:00 AM – 3:00 PM"],["Tue","7:00 AM – 3:00 PM"],["Wed","7:00 AM – 3:00 PM"],
             ["Thu","7:00 AM – 3:00 PM"],["Fri","7:00 AM – 3:00 PM"],["Sat","8:00 AM – 4:00 PM"],["Sun","8:00 AM – 4:00 PM"]],
    outlets: "unknown", seating: "Small local shop, co-working space right next door",
    parking: "street", noise: "moderate", wifi: "unknown",
    popular: ["Kraft coffee drinks", "Iced tea", "Cortado (café miel)"],
    tag: "Co-working next door",
  },
  {
    id: "chicago-muse", city: "chicago",
    name: "Muse Coffee Studio",
    address: "747 S Western Ave, Chicago, IL 60612",
    lat: 41.871737, lng: -87.6859009,
    rating: 4.9, ratingCount: 303, price: 1,
    phone: "+1 312-285-2072",
    hours: [["Mon","8:00 AM – 3:00 PM"],["Tue","8:00 AM – 3:00 PM"],["Wed","8:00 AM – 3:00 PM"],
             ["Thu","8:00 AM – 3:00 PM"],["Fri","8:00 AM – 3:00 PM"],["Sat","8:00 AM – 3:00 PM"],["Sun","8:00 AM – 3:00 PM"]],
    outlets: "unknown", seating: "Living-room-like space, plenty of comfortable seating, local art on the walls",
    parking: "unknown", noise: "moderate", wifi: "unknown",
    popular: ["Cookie butter latte", "Lavender matcha", "Donut"],
    tag: "Recommended for working",
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
  score += (shop.rating ?? 4) - 4; // small nudge from rating
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
  ["#EDEAE2", "#D8D4CB"],
  ["#E2DED4", "#C7C2B6"],
  ["#D8D4CB", "#B5AFA0"],
  ["#C7C2B6", "#A8A296"],
  ["#B5AFA0", "#948E7E"],
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
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ height }}>
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
        <Coffee size={height > 80 ? 30 : 20} className="text-black/40" />
      </div>
      <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[9px] text-black/40 font-mono bg-white/40 px-1.5 py-0.5 rounded">
        <ImageOff size={9} /> placeholder
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[#E7E4DD] text-[#4A453D]",
    good: "bg-[var(--accent)] text-[#FFFFFF]",
    warn: "bg-[#E7E4DD] text-[#4A453D]",
    quiet: "bg-[#E7E4DD] text-[#4A453D]",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function TicketStub({ shop, distance, expanded, onToggle, saved, onToggleSave }) {
  const status = getOpenStatus(shop);
  const NoiseIcon = NOISE_ICON[shop.noise] || Volume2;
  const priceLabel = shop.price ? "$".repeat(shop.price) + " · Affordable" : "Pricing not listed";
  const [tab, setTab] = useState("overview");
  const hasPhotos = shop.photos && shop.photos.length > 0;
  const hasSpecials = shop.specials && shop.specials.length > 0;

  return (
    <div
      className={`w-full relative rounded-[22px] transition-all duration-200 overflow-hidden
        ${expanded
          ? "shadow-[0_10px_30px_-8px_var(--accent-glow)] ring-2 ring-[var(--accent)] bg-[#FFF8F2]"
          : "shadow-[0_2px_10px_rgba(120,90,60,0.08)] hover:shadow-[0_8px_22px_rgba(120,90,60,0.14)] hover:-translate-y-0.5 bg-[#FFFFFF]"}`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        aria-label="Save"
      >
        <Heart size={14} className={saved ? "text-[var(--accent)]" : "text-[#C7C2B6]"} fill={saved ? "var(--accent)" : "none"} />
      </button>

      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between px-4 pt-3 pb-2 pr-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#171512] truncate" style={{ fontFamily: "'Fraunces', serif" }}>
                {shop.name}
              </h3>
            </div>
            <p className="text-xs text-[#8A8478] mt-0.5 truncate">{shop.address}</p>
          </div>
          <div className="flex items-start gap-2 shrink-0 ml-2">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-[var(--accent)] text-sm font-mono">
                <Star size={13} fill="var(--accent)" strokeWidth={0} />
                {shop.rating != null ? shop.rating.toFixed(1) : "—"}
              </div>
              <span className="text-[10px] text-[#8A8478] font-mono">{distance.toFixed(1)} mi</span>
            </div>
            <ChevronDown
              size={16}
              className={`text-[#8A8478] mt-0.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* perforation */}
        <div className="relative h-0 border-t border-dashed border-[#E8D9CC] mx-4">
          <div className="absolute -left-6 -top-2 w-4 h-4 rounded-full bg-[#FFF3E9]" />
          <div className="absolute -right-6 -top-2 w-4 h-4 rounded-full bg-[#FFF3E9]" />
        </div>

        <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className={`flex items-center gap-1 text-[11px] font-mono ${shop.outlets === "available" ? "text-[#171512]" : "text-[#8A8478]"}`}>
            <Zap size={12} /> {OUTLET_LABEL[shop.outlets] || "Limited outlets"}
          </span>
          <span className={`flex items-center gap-1 text-[11px] font-mono ${shop.parking !== "unknown" ? "text-[#171512]" : "text-[#8A8478]"}`}>
            <Car size={12} /> {PARKING_LABEL[shop.parking] || "Street parking"}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#8A8478]">
            <NoiseIcon size={12} /> {NOISE_LABEL[shop.noise]}
          </span>
        </div>

        <div className="px-4 pb-3 flex items-center justify-between">
          <Pill tone={shop.tag.startsWith("Recommended") ? "good" : "neutral"}>
            {shop.tag.startsWith("Recommended") ? `✨ ${shop.tag}` : shop.tag}
          </Pill>
          <span className="text-[10px] font-mono text-[#8A8478]">{status.text}</span>
        </div>
      </button>

      {/* Expanded detail */}
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#F0E4D8] px-4 pt-3 pb-4">

            {/* Tab bar */}
            <div className="flex items-center gap-1 mb-3 bg-[#FFF3E9] rounded-full p-1 w-fit">
              {[
                { key: "overview", label: "Overview" },
                { key: "photos", label: "Photos" },
                { key: "menu", label: "Menu" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={(e) => { e.stopPropagation(); setTab(t.key); }}
                  className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors
                    ${tab === t.key ? "bg-[var(--accent)] text-[#FFFFFF]" : "text-[#8A8478] hover:text-[#171512]"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-2 text-xs text-[#171512]">
                    <DollarSign size={13} className="text-[#8A8478]" /> {priceLabel}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#171512]">
                    <Phone size={13} className="text-[#8A8478]" /> {shop.phone}
                  </div>
                </div>

                <p className="text-sm text-[#4A453D] leading-relaxed mb-3">{shop.seating}</p>

                <h4 className="text-[10px] uppercase tracking-widest text-[#8A8478] mb-1.5 font-mono">Hours this week</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {shop.hours.map(([day, range]) => (
                    <div key={day} className="flex justify-between text-[#4A453D] font-mono text-[11px]">
                      <span className="text-[#8A8478]">{day}</span>
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
                    <p className="text-[11px] text-[#8A8478] italic mt-2 leading-relaxed">
                      No real photos loaded for this shop yet. In production this pulls from the Google
                      Places Photo API (drop image URLs into <code className="text-[#8A8478]">shop.photos</code>),
                      with a community "Add a photo" upload as a fallback for shops with thin coverage.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "menu" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] uppercase tracking-widest text-[#8A8478] font-mono">Menu</h4>
                  <Pill tone="warn">Community-sourced</Pill>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {shop.popular.map((item) => (
                    <span key={item} className="text-[11px] bg-[#FFFFFF] text-[#171512] px-2.5 py-1 rounded-full">{item}</span>
                  ))}
                </div>

                <h4 className="text-[10px] uppercase tracking-widest text-[#8A8478] mb-1.5 font-mono">Specials</h4>
                {hasSpecials ? (
                  <ul className="space-y-1 mb-3">
                    {shop.specials.map((sp) => (
                      <li key={sp} className="text-sm text-[#4A453D]">{sp}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#8A8478] mb-3">No specials reported yet.</p>
                )}

                <p className="text-[11px] text-[#8A8478] italic leading-relaxed">
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


export default function Perch() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState({ outlets: false, parking: false, quiet: false });
  const [cityKey, setCityKey] = useState("norcross");
  const [cityInput, setCityInput] = useState("");
  const [cityNotFound, setCityNotFound] = useState(false);
  const [liveShops, setLiveShops] = useState([]);
  const [liveLabel, setLiveLabel] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  const city = cityKey === "live"
    ? { key: "live", label: liveLabel, accent: LIVE_ACCENT }
    : CITIES[cityKey];

  const [expandedId, setExpandedId] = useState(SHOPS.find((s) => s.city === "norcross").id);
  const [savedIds, setSavedIds] = useState(new Set());

  const citiesWithShops = useMemo(() => {
    if (cityKey === "live") {
      if (liveShops.length === 0) return [];
      const centroid = {
        lat: liveShops.reduce((sum, s) => sum + s.lat, 0) / liveShops.length,
        lng: liveShops.reduce((sum, s) => sum + s.lng, 0) / liveShops.length,
      };
      return liveShops.map((s) => ({ ...s, distance: haversineMiles(centroid, s), score: workScore(s) }));
    }
    return SHOPS.map((s) => ({ ...s, distance: haversineMiles(city, s), score: workScore(s) })).filter((s) => s.city === cityKey);
  }, [cityKey, city, liveShops]);

  const filtered = useMemo(() => {
    let list = citiesWithShops.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.address.toLowerCase().includes(query.toLowerCase())
    );
    if (filters.outlets) list = list.filter((s) => s.outlets === "available");
    if (filters.parking) list = list.filter((s) => s.parking === "lot" || s.parking === "street");
    if (filters.quiet) list = list.filter((s) => s.noise === "quiet");

    if (sort === "distance") list = [...list].sort((a, b) => a.distance - b.distance);
    else if (sort === "rating") list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else list = [...list].sort((a, b) => b.score - a.score);

    return list;
  }, [citiesWithShops, query, filters, sort]);

  async function handleCitySubmit(e) {
    e.preventDefault();
    const match = findCity(cityInput);
    if (match) {
      setCityKey(match.key);
      setExpandedId(SHOPS.find((s) => s.city === match.key)?.id ?? null);
      setCityInput("");
      setCityNotFound(false);
      setLiveError("");
      return;
    }

    if (!GOOGLE_PLACES_API_KEY) {
      setCityNotFound(true);
      return;
    }

    setLiveLoading(true);
    setLiveError("");
    setCityNotFound(false);
    try {
      const results = await searchLivePlaces(cityInput);
      if (results.length === 0) {
        setLiveError(`No coffee shops found for "${cityInput}". Try a different spelling or a nearby city.`);
      } else {
        setLiveShops(results);
        setLiveLabel(cityInput);
        setCityKey("live");
        setExpandedId(results[0].id);
      }
    } catch (err) {
      setLiveError(err.message || "Live search failed. Check your API key and try again.");
    } finally {
      setLiveLoading(false);
    }
  }

  function selectCity(key) {
    setCityKey(key);
    setExpandedId(SHOPS.find((s) => s.city === key)?.id ?? null);
    setCityInput("");
    setCityNotFound(false);
    setLiveError("");
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#FFF8F1] via-[#FFF3E9] to-[#FDEADB] text-[#171512]"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui", "--accent": city.accent, "--accent-glow": city.accent + "59" }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @keyframes steamFloat {
          0% { transform: translateY(0) scaleX(1); opacity: 0.35; }
          50% { transform: translateY(-3px) scaleX(1.15); opacity: 0.6; }
          100% { transform: translateY(0) scaleX(1); opacity: 0.35; }
        }
        .steam-wisp { animation: steamFloat 2.4s ease-in-out infinite; }
        .steam-wisp:nth-child(2) { animation-delay: 0.4s; }
      `}</style>

      {/* Header */}
      <header className="border-b border-[#F0E4D8] px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
              <span className="steam-wisp w-0.5 h-2 rounded-full bg-[var(--accent)]/50 block" />
              <span className="steam-wisp w-0.5 h-2 rounded-full bg-[var(--accent)]/50 block" />
            </div>
            <div className="w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-[0_4px_12px_var(--accent-glow)]">
              <Coffee size={18} className="text-[#FFF8F1]" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#171512]" style={{ fontFamily: "'Fraunces', serif" }}>Perch</h1>
            <p className="text-[11px] text-[#8A8478] -mt-0.5">☕ find your next cozy spot to settle in</p>
          </div>
        </div>
        <span className="text-xs font-mono text-[#B5AFA0] hidden sm:block">📍 {city.label}</span>
      </header>

      {/* City switcher */}
      <div className="max-w-2xl mx-auto px-6 pt-5">
        <form onSubmit={handleCitySubmit} className="relative mb-2">
          <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)]" />
          <input
            value={cityInput}
            onChange={(e) => { setCityInput(e.target.value); setCityNotFound(false); setLiveError(""); }}
            placeholder={
              GOOGLE_PLACES_API_KEY
                ? `Currently browsing ${city.label} — search any US city...`
                : `Currently browsing ${city.label} — add an API key to search any US city`
            }
            className="w-full bg-white border border-[#F0E4D8] rounded-full pl-10 pr-4 py-2.5 text-sm text-[#171512] placeholder-[#B5AFA0] outline-none shadow-[0_2px_8px_rgba(120,90,60,0.06)] focus:border-[var(--accent)] transition-shadow"
          />
        </form>

        {liveLoading && (
          <p className="text-[11px] text-[#8A8478] mb-2">Searching live for "{cityInput}"...</p>
        )}
        {liveError && (
          <p className="text-[11px] text-[#C0392B] mb-2 leading-relaxed">{liveError}</p>
        )}
        {cityNotFound && !GOOGLE_PLACES_API_KEY && (
          <p className="text-[11px] text-[#B5AFA0] mb-2 leading-relaxed">
            "{cityInput}" isn't one of the preloaded cities. Add a Google Places API key (see README) to
            search any US city live — until then, try one of the cities below.
          </p>
        )}
        {cityKey === "live" && liveShops.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LIVE_ACCENT }} />
            <span className="text-[11px] font-mono text-[#8A8478]">Live results from Google Places for "{liveLabel}"</span>
          </div>
        )}

        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {CITY_LIST.map((c) => (
            <button
              key={c.key}
              onClick={() => selectCity(c.key)}
              className={`text-[11px] px-3 py-1 rounded-full border font-medium transition-all ${
                cityKey === c.key ? "text-white" : "bg-white text-[#8A8478]"
              }`}
              style={cityKey === c.key ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: "#F0E4D8" }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#B5AFA0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shops or streets..."
              className="w-full bg-[#FFFFFF] border border-[#F0E4D8] rounded-full pl-10 pr-4 py-2.5 text-sm text-[#171512] placeholder-[#B5AFA0] outline-none shadow-[0_2px_8px_rgba(120,90,60,0.06)] focus:border-[var(--accent)] focus:shadow-[0_2px_12px_var(--accent-glow)] transition-shadow"
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
                className={`text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all
                  ${sort === opt.key ? "bg-[var(--accent)] text-[#FFFFFF] border-[var(--accent)] shadow-[0_3px_10px_var(--accent-glow)]" : "bg-white border-[#F0E4D8] text-[#8A8478] hover:border-[var(--accent)]/40"}`}
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
                className={`flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full border font-mono transition-all
                  ${filters[key] ? "bg-[var(--accent)] border-[var(--accent)] text-[#FFFFFF] shadow-[0_3px_10px_var(--accent-glow)]" : "bg-white border-[#F0E4D8] text-[#8A8478] hover:border-[var(--accent)]/40"}`}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-[#B5AFA0] mb-3 font-mono">{filtered.length} spots in {city.label} · sorted by {sort}</p>

          <div className="space-y-3">
            {filtered.map((shop) => (
              <TicketStub
                key={shop.id}
                shop={shop}
                distance={shop.distance}
                expanded={expandedId === shop.id}
                onToggle={() => setExpandedId((cur) => (cur === shop.id ? null : shop.id))}
                saved={savedIds.has(shop.id)}
                onToggleSave={() => setSavedIds((cur) => {
                  const next = new Set(cur);
                  next.has(shop.id) ? next.delete(shop.id) : next.add(shop.id);
                  return next;
                })}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[#B5AFA0] py-8 text-center">No cozy spots match those vibes yet 🥲 — try loosening a filter.</p>
            )}
          </div>
        </div>
      </div>

      <footer className="px-6 py-6 text-center text-[11px] text-[#B5AFA0] font-mono">
        Made with ☕ + 🧡 · Data compiled from public listings & reviews near Norcross, GA — work-setup details are community-reported and may not be current
      </footer>
    </div>
  );
}

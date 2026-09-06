import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  MapPin, Zap, Armchair, Car, Volume1, Volume2, VolumeX, Star,
  Clock, Search, Coffee, Phone, ChevronDown, X, Wifi, DollarSign, ImageOff, Heart,
  Info, Image, BookOpen, Sparkles, CheckCircle2, StickyNote, Home, LogIn, LogOut,
} from "lucide-react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider, firebaseEnabled } from "./firebase.js";

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
  norcross: { key: "norcross", label: "Norcross, GA", emoji: "🌳", aliases: ["norcross", "norcross ga", "atlanta", "30071"], lat: 33.9412, lng: -84.2135, accent: "#6F4630" },
  austin:   { key: "austin",   label: "Austin, TX",   emoji: "🌵", aliases: ["austin", "austin tx", "atx"],                   lat: 30.2672, lng: -97.7431, accent: "#6F4630" },
  seattle:  { key: "seattle",  label: "Seattle, WA",  emoji: "🌧️", aliases: ["seattle", "seattle wa"],                        lat: 47.6062, lng: -122.3321, accent: "#6F4630" },
  chicago:  { key: "chicago",  label: "Chicago, IL",  emoji: "🌆", aliases: ["chicago", "chicago il", "chi"],                 lat: 41.8781, lng: -87.6298, accent: "#6F4630" },
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
const LIVE_ACCENT = "#6F4630";

// Two full visual identities the person can switch between — color, page
// gradient, tagline, and mascot all change together, not just a color swap.
const THEMES = {
  coffee: {
    key: "coffee",
    label: "Coffee",
    emoji: "☕",
    accent: "#6F4630",
    bgClass: "bg-gradient-to-b from-[#FFF8F1] via-[#FFF3E9] to-[#FDEADB]",
    chipBg: "#FFF3E9",
    cardBg: "#FFF8F2",
    tagline: "☕ find your next cozy spot to settle in",
    heartEmoji: "🤎",
    jarEmoji: "🫙",
  },
  matcha: {
    key: "matcha",
    label: "Matcha",
    emoji: "🍵",
    accent: "#5E7A3F",
    bgClass: "bg-gradient-to-b from-[#F6F8EE] via-[#EFF4E2] to-[#E3EDD1]",
    chipBg: "#EFF4E2",
    cardBg: "#F5F8ED",
    tagline: "🍵 find your next cozy spot to settle in",
    heartEmoji: "🍵",
    jarEmoji: "🍃",
  },
};

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

function mapParkingOptions(po) {
  if (!po) return "unknown";
  if (po.freeParkingLot || po.paidParkingLot || po.freeGarageParking || po.paidGarageParking) return "lot";
  if (po.freeStreetParking || po.paidStreetParking) return "street";
  return "unknown";
}

// Google doesn't have literal "outlets available" or "noise level" fields.
// We scan the review text it does return for the same kind of mentions a
// human would look for — same technique used by hand for the curated
// cities, just automated. This is a heuristic, not ground truth.
function scanReviewsForSignals(reviews) {
  if (!reviews || reviews.length === 0) return { outlets: "unknown", noise: "unknown" };
  const text = reviews.map((r) => r.text?.text || "").join(" ").toLowerCase();
  const outletWords = ["outlet", "plug", "charging port", "power outlet", "charger"];
  const quietWords = ["quiet", "peaceful", "calm", "great for studying", "great for work", "great to work"];
  const loudWords = ["loud", "noisy", "crowded", "packed", "chaotic"];
  const hasOutlets = outletWords.some((w) => text.includes(w));
  const quietScore = quietWords.filter((w) => text.includes(w)).length;
  const loudScore = loudWords.filter((w) => text.includes(w)).length;
  let noise = "unknown";
  if (quietScore > 0 && quietScore >= loudScore) noise = "quiet";
  else if (loudScore > 0) noise = "moderate";
  return { outlets: hasOutlets ? "available" : "unknown", noise };
}

// Suggests real, disambiguated US cities as the person types — e.g. typing
// "Rome" returns separate entries for Rome, GA and Rome, NY, so there's no
// guessing which one they mean before the actual search even runs.
async function autocompleteCities(input) {
  if (!GOOGLE_PLACES_API_KEY || !input || input.trim().length < 2) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      },
      body: JSON.stringify({
        input,
        includedPrimaryTypes: ["locality"],
        includedRegionCodes: ["us"],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({
        id: p.placeId,
        mainText: p.structuredFormat?.mainText?.text || p.text?.text || "",
        secondaryText: p.structuredFormat?.secondaryText?.text || "",
        fullText: p.text?.text || "",
      }));
  } catch {
    return [];
  }
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
        "places.parkingOptions", "places.outdoorSeating", "places.reviews",
      ].join(","),
    },
    body: JSON.stringify({
      // regionCode biases (doesn't hard-filter) toward the US, and appending
      // "USA" to the text itself gives a stronger disambiguating signal for
      // city names that exist in multiple countries — e.g. "Rome, GA" vs
      // "Rome, Italy." Users can still type the state for extra precision.
      textQuery: `coffee shops good for working in ${cityText}${/\busa\b|united states/i.test(cityText) ? "" : ", USA"}`,
      regionCode: "US",
      maxResultCount: 12,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Places API request failed (${res.status}).`);
  }

  const data = await res.json();
  const places = data.places || [];

  return places.map((p) => {
    const signals = scanReviewsForSignals(p.reviews);
    const parking = mapParkingOptions(p.parkingOptions);
    return {
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
      outlets: signals.outlets,
      parking,
      noise: signals.noise,
      wifi: "unknown",
      seating: p.outdoorSeating
        ? "Indoor and outdoor seating available, per Google Places."
        : "No community details reported for this live result yet — be the first to add one.",
      popular: [],
      specials: [],
      tag: "Live result",
      photos: (p.photos || []).slice(0, 3).map(
        (photo) => `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=600&key=${GOOGLE_PLACES_API_KEY}`
      ),
    };
  });
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


// ---------------------------------------------------------------------------
// Persisting Saved and Visited lists in the browser via localStorage, so
// they survive page reloads and closing the tab. Each is stored as a JSON
// array of [id, shopData] pairs (Maps aren't directly JSON-serializable).
// ---------------------------------------------------------------------------
const STORAGE_KEYS = { saved: "perch:savedShops", visited: "perch:visitedShops" };

function loadMapFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const entries = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveMapToStorage(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — fail silently,
    // the app still works, it just won't persist this session.
  }
}

// ---------------------------------------------------------------------------
// Optional cloud sync (Firebase). Signed-out users are unaffected — their
// data stays in localStorage only, exactly as before. Signed-in users get
// the same data synced to Firestore under their account, keyed by uid, so
// it follows them to any device. localStorage still acts as an instant
// local cache either way.
// ---------------------------------------------------------------------------
async function loadCloudData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    savedShops: new Map(Object.entries(data.savedShops || {})),
    visitedShops: new Map(Object.entries(data.visitedShops || {})),
  };
}

async function saveCloudField(uid, field, map) {
  try {
    await setDoc(doc(db, "users", uid), { [field]: Object.fromEntries(map) }, { merge: true });
  } catch (err) {
    console.error("Cloud sync failed:", err);
  }
}

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
function ShopArt({ shop, height = 96, MascotIcon }) {
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
        <div className="relative">
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex gap-1">
            <span className="steam-wisp w-0.5 h-2 rounded-full bg-black/25 block" />
            <span className="steam-wisp w-0.5 h-2 rounded-full bg-black/25 block" />
          </div>
          <MascotIcon size={height > 80 ? 52 : 38} className="text-black/50" />
        </div>
      </div>
      <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[9px] text-black/40 font-mono bg-white/40 px-1.5 py-0.5 rounded">
        <ImageOff size={9} /> placeholder
      </div>
    </div>
  );
}

// The header mascot for the coffee theme — a little bird perched on a
// coffee cup, a literal pun on the app's own name ("Perch"). Every
// currentColor body part gets a thin dark outline so wings/tail/body read
// as distinct parts instead of merging into one silhouette, and the wings
// flap via CSS animation (wing-left/wing-right classes, defined once
// globally). Tested by rendering to real pixels at 24px and 48px before
// finalizing.
// Shared by both mascots: pupils shift slightly toward the mouse cursor,
// clamped so they never leave the eye whites. Each mascot instance measures
// its own position, so every bird on screen looks toward the cursor
// independently (the one in the header, and every one on a card).
function useEyeTracking(maxOffset = 0.7) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMove(e) {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, dist / 200);
      setOffset({ x: (dx / dist) * maxOffset * pull, y: (dy / dist) * maxOffset * pull });
    }
    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMove);
  }, [maxOffset]);

  return [ref, offset];
}

function LogoBuddy({ size = 24, className = "" }) {
  const [svgRef, eye] = useEyeTracking(0.7);
  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 24 24" className={className}>
      {/* the branch it's perched on — fixed brown, same in both themes */}
      <g stroke="#3A2A1E" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round">
        <rect x="2.5" y="18" width="19" height="2" rx="1" fill="#8A6440" />
        <path d="M4 18l-1.8-2.2" fill="none" />
        <path d="M20 20l1.8 2" fill="none" />
      </g>

      {/* leaves sprouting off the branch — fixed green, same in both themes */}
      <g fill="#6B8F4E" stroke="#3A2A1E" strokeWidth="0.5" strokeLinejoin="round">
        <path d="M3.5 15.5c1.6.3 2.5 1.7 2.1 3.2c-1.7 0-3-1.4-2.1-3.2Z" />
        <path d="M20.5 21.3c-1.6.3-2.9-.8-2.8-2.4c1.7-.3 3.2.8 2.8 2.4Z" />
        <path d="M2 19.8c1.5-.4 2.9.4 3.1 2c-1.6.6-3.2-.3-3.1-2Z" />
      </g>

      {/* the bird itself: one staple tan color, regardless of theme */}
      <g fill="#EAD3B0" stroke="#3A2A1E" strokeWidth="0.6" strokeLinejoin="round">
        {/* feet */}
        <ellipse cx="8.6" cy="18.2" rx="1.3" ry="1" />
        <ellipse cx="15.4" cy="18.2" rx="1.3" ry="1" />

        {/* tail, sticking out the back */}
        <path d="M16.3 16.4l3.2.7l-2 2.4Z" />
        <path d="M17.2 14.7l3.5-.4l-1.7 2.9Z" />

        {/* wings: flap via CSS animation */}
        <ellipse className="wing-left" cx="5.4" cy="12.4" rx="2.6" ry="3.6" />
        <ellipse className="wing-right" cx="18.6" cy="12.4" rx="2.6" ry="3.6" />

        {/* round bird body/head */}
        <ellipse cx="12" cy="11.4" rx="7.3" ry="7" />
      </g>

      {/* head feather tuft */}
      <path d="M10.8 2.9l.6 1.8M12.5 2.4v2" stroke="#3A2A1E" strokeWidth="1.4" strokeLinecap="round" fill="none" />

      {/* belly patch for two-tone depth */}
      <ellipse cx="12" cy="14.9" rx="4.2" ry="2.6" fill="#FFF8F1" opacity="0.5" stroke="#3A2A1E" strokeWidth="0.4" strokeOpacity="0.3" />

      {/* eyebrows */}
      <path d="M6.8 8.2c.9-.7 2-.7 2.9-.1" stroke="#3A2A1E" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M17.2 8.2c-.9-.7-2-.7-2.9-.1" stroke="#3A2A1E" strokeWidth="1.1" strokeLinecap="round" fill="none" />

      {/* beak */}
      <path d="M10.6 13.2l1.4 1.7l1.4-1.7Z" fill="#3A2A1E" />

      {/* big eyes: white base stays put, pupil + sparkle track the cursor */}
      <circle cx="8.6" cy="10.5" r="2.5" fill="#FFF8F1" stroke="#3A2A1E" strokeWidth="0.4" />
      <circle cx="15.4" cy="10.5" r="2.5" fill="#FFF8F1" stroke="#3A2A1E" strokeWidth="0.4" />
      <g transform={`translate(${eye.x} ${eye.y})`}>
        <circle cx="9.1" cy="11" r="1.35" fill="#3A2A1E" />
        <circle cx="15.9" cy="11" r="1.35" fill="#3A2A1E" />
        <circle cx="8.5" cy="10.3" r="0.5" fill="#FFF8F1" />
        <circle cx="15.3" cy="10.3" r="0.5" fill="#FFF8F1" />
      </g>

      {/* blush */}
      <ellipse cx="6.6" cy="13.2" rx="1.5" ry="1" fill="#FF9E8A" opacity="0.7" />
      <ellipse cx="17.4" cy="13.2" rx="1.5" ry="1" fill="#FF9E8A" opacity="0.7" />
    </svg>
  );
}

// The matcha-theme counterpart — identical bird and identical branch (the
// branch already has both brown and green built in, so it doesn't need to
// change per theme). Only the head accessory differs: a leaf sprout
// instead of a feather tuft, for a little thematic variety.
function MatchaBuddy({ size = 24, className = "" }) {
  const [svgRef, eye] = useEyeTracking(0.7);
  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 24 24" className={className}>
      {/* the branch it's perched on */}
      <g stroke="#3A2A1E" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round">
        <rect x="2.5" y="18" width="19" height="2" rx="1" fill="#8A6440" />
        <path d="M4 18l-1.8-2.2" fill="none" />
        <path d="M20 20l1.8 2" fill="none" />
      </g>

      {/* leaves sprouting off the branch */}
      <g fill="#6B8F4E" stroke="#3A2A1E" strokeWidth="0.5" strokeLinejoin="round">
        <path d="M3.5 15.5c1.6.3 2.5 1.7 2.1 3.2c-1.7 0-3-1.4-2.1-3.2Z" />
        <path d="M20.5 21.3c-1.6.3-2.9-.8-2.8-2.4c1.7-.3 3.2.8 2.8 2.4Z" />
        <path d="M2 19.8c1.5-.4 2.9.4 3.1 2c-1.6.6-3.2-.3-3.1-2Z" />
      </g>

      {/* the bird itself: same staple tan color as the coffee version */}
      <g fill="#EAD3B0" stroke="#3A2A1E" strokeWidth="0.6" strokeLinejoin="round">
        {/* feet */}
        <ellipse cx="8.6" cy="18.2" rx="1.3" ry="1" />
        <ellipse cx="15.4" cy="18.2" rx="1.3" ry="1" />

        {/* tail, sticking out the back */}
        <path d="M16.3 16.4l3.2.7l-2 2.4Z" />
        <path d="M17.2 14.7l3.5-.4l-1.7 2.9Z" />

        {/* wings: flap via CSS animation */}
        <ellipse className="wing-left" cx="5.4" cy="12.4" rx="2.6" ry="3.6" />
        <ellipse className="wing-right" cx="18.6" cy="12.4" rx="2.6" ry="3.6" />

        {/* round bird body/head */}
        <ellipse cx="12" cy="11.4" rx="7.3" ry="7" />
      </g>

      {/* leaf sprout instead of a feather tuft */}
      <path d="M12 2.5c1.5.6 2.2 1.9 1.6 3.3c-1.5-.1-2.5-1.4-1.6-3.3Z" fill="#6B8F4E" stroke="#3A2A1E" strokeWidth="0.5" />

      {/* belly patch for two-tone depth */}
      <ellipse cx="12" cy="14.9" rx="4.2" ry="2.6" fill="#FFF8F1" opacity="0.5" stroke="#3A2A1E" strokeWidth="0.4" strokeOpacity="0.3" />

      {/* eyebrows */}
      <path d="M6.8 8.2c.9-.7 2-.7 2.9-.1" stroke="#3A2A1E" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M17.2 8.2c-.9-.7-2-.7-2.9-.1" stroke="#3A2A1E" strokeWidth="1.1" strokeLinecap="round" fill="none" />

      {/* beak */}
      <path d="M10.6 13.2l1.4 1.7l1.4-1.7Z" fill="#3A2A1E" />

      {/* big eyes: white base stays put, pupil + sparkle track the cursor */}
      <circle cx="8.6" cy="10.5" r="2.5" fill="#FFF8F1" stroke="#3A2A1E" strokeWidth="0.4" />
      <circle cx="15.4" cy="10.5" r="2.5" fill="#FFF8F1" stroke="#3A2A1E" strokeWidth="0.4" />
      <g transform={`translate(${eye.x} ${eye.y})`}>
        <circle cx="9.1" cy="11" r="1.35" fill="#3A2A1E" />
        <circle cx="15.9" cy="11" r="1.35" fill="#3A2A1E" />
        <circle cx="8.5" cy="10.3" r="0.5" fill="#FFF8F1" />
        <circle cx="15.3" cy="10.3" r="0.5" fill="#FFF8F1" />
      </g>

      {/* blush */}
      <ellipse cx="6.6" cy="13.2" rx="1.5" ry="1" fill="#FF9E8A" opacity="0.7" />
      <ellipse cx="17.4" cy="13.2" rx="1.5" ry="1" fill="#FF9E8A" opacity="0.7" />
    </svg>
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

function TicketStub({ shop, distance, expanded, onToggle, saved, onToggleSave, accent, cityLabel, showDistance = true, visited, onToggleVisited, note, onNoteChange, myRating = 0, onRatingChange, MascotIcon }) {
  const status = getOpenStatus(shop);
  const NoiseIcon = NOISE_ICON[shop.noise] || Volume2;
  const priceLabel = shop.price ? "$".repeat(shop.price) + " · Affordable" : "Pricing not listed";
  const [tab, setTab] = useState("overview");
  const hasPhotos = Boolean(shop.photos && shop.photos.length > 0);
  const hasSpecials = shop.specials && shop.specials.length > 0;

  return (
    <div
      className={`w-full relative rounded-[22px] transition-all duration-200 overflow-hidden
        ${expanded
          ? "shadow-[0_10px_30px_-8px_var(--accent-glow)] ring-2 ring-[var(--accent)] bg-[var(--card-bg)]"
          : "shadow-[0_2px_10px_rgba(120,90,60,0.08)] hover:shadow-[0_8px_22px_rgba(120,90,60,0.14)] hover:-translate-y-0.5 bg-[#FFFFFF]"}`}
      style={accent ? { "--accent": accent, "--accent-glow": accent + "59" } : undefined}
    >
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisited(); }}
          className="w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          aria-label="Mark visited"
          title="Mark as visited"
        >
          <CheckCircle2 size={14} className={visited ? "text-[var(--accent)]" : "text-[#C7C2B6]"} fill={visited ? "var(--accent)" : "none"} strokeWidth={visited ? 0 : 1.5} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          className="w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          aria-label="Save"
        >
          <Heart size={14} className={saved ? "text-[var(--accent)]" : "text-[#C7C2B6]"} fill={saved ? "var(--accent)" : "none"} />
        </button>
      </div>

      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between px-4 pt-3 pb-2 pr-20">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#171512] truncate" style={{ fontFamily: "'Fraunces', serif" }}>
                {shop.name}
              </h3>
              {visited && (
                <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-mono text-[var(--accent)]">
                  <CheckCircle2 size={11} /> visited
                </span>
              )}
            </div>
            <p className="text-xs text-[#8A8478] mt-0.5 truncate">{shop.address}</p>
            {cityLabel && (
              <span className="inline-block mt-1 text-[10px] font-mono text-[var(--accent)]">📍 {cityLabel}</span>
            )}
            {visited && myRating > 0 && (
              <div className="inline-flex items-center gap-1 mt-1.5 bg-[var(--chip-bg)] rounded-full pl-1.5 pr-2 py-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[#8A8478] font-mono">You rated</span>
                <div className="flex items-center gap-[1px]">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={9}
                      className={i <= myRating ? "text-[var(--accent)]" : "text-[#D8D4CB]"}
                      fill={i <= myRating ? "var(--accent)" : "none"}
                      strokeWidth={i <= myRating ? 0 : 1.5}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 shrink-0 ml-2">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-[var(--accent)] text-sm font-mono">
                <Star size={13} fill="var(--accent)" strokeWidth={0} />
                {shop.rating != null ? shop.rating.toFixed(1) : "—"}
              </div>
              {showDistance && <span className="text-[10px] text-[#8A8478] font-mono">{distance.toFixed(1)} mi</span>}
            </div>
            <ChevronDown
              size={16}
              className={`text-[#8A8478] mt-0.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* perforation */}
        <div className="relative h-0 border-t border-dashed border-[#E8D9CC] mx-4">
          <div className="absolute -left-6 -top-2 w-4 h-4 rounded-full bg-[var(--chip-bg)]" />
          <div className="absolute -right-6 -top-2 w-4 h-4 rounded-full bg-[var(--chip-bg)]" />
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
            <div className="flex items-center gap-1 mb-3 bg-[var(--chip-bg)] rounded-full p-1 w-fit">
              {[
                { key: "overview", label: "Overview", Icon: Info },
                { key: "photos", label: "Photos", Icon: Image, show: hasPhotos },
                { key: "menu", label: "Menu", Icon: BookOpen },
                { key: "notes", label: "My Notes", Icon: StickyNote },
              ].filter((t) => t.show !== false).map((t) => (
                <button
                  key={t.key}
                  onClick={(e) => { e.stopPropagation(); setTab(t.key); }}
                  className={`flex items-center gap-1 text-[11px] font-medium px-3 py-1 rounded-full transition-colors
                    ${tab === t.key ? "bg-[var(--accent)] text-[#FFFFFF]" : "text-[#8A8478] hover:text-[#171512]"}`}
                >
                  <t.Icon size={11} /> {t.label}
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
                    <ShopArt shop={shop} height={110} MascotIcon={MascotIcon} />
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

            {tab === "notes" && (
              <div onClick={(e) => e.stopPropagation()}>
                {visited ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-[#8A8478] font-mono">My Notes</h4>
                      <button
                        onClick={onToggleVisited}
                        className="text-[10px] font-mono text-[#8A8478] hover:text-[var(--accent)] underline"
                      >
                        unmark visited
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-[#8A8478]">Your rating:</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <button
                            key={i}
                            onClick={() => onRatingChange(i)}
                            aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`}
                            className="hover:scale-125 transition-transform"
                          >
                            <Star
                              size={18}
                              className={i <= myRating ? "text-[var(--accent)]" : "text-[#D8D4CB]"}
                              fill={i <= myRating ? "var(--accent)" : "none"}
                              strokeWidth={i <= myRating ? 0 : 1.5}
                            />
                          </button>
                        ))}
                      </div>
                      {myRating > 0 && <span className="text-[10px] text-[#B5AFA0] font-mono">tap same star to clear</span>}
                    </div>

                    <textarea
                      value={note || ""}
                      onChange={(e) => onNoteChange(e.target.value)}
                      placeholder="What did you order? Was it busy? Any tips for next time?"
                      rows={4}
                      className="w-full bg-[#FFFFFF] border border-[#E7E4DD] rounded-xl p-3 text-sm text-[#171512] placeholder-[#B5AFA0] outline-none focus:border-[var(--accent)] resize-none"
                    />
                    <p className="text-[10px] text-[#B5AFA0] mt-1.5">Saved automatically as you type.</p>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-center py-6">
                    <CheckCircle2 size={28} className="text-[#C7C2B6] mb-2" />
                    <p className="text-sm text-[#8A8478] max-w-[220px] mb-3">
                      Mark this spot as visited to jot down your own notes and remember it later.
                    </p>
                    <button
                      onClick={onToggleVisited}
                      className="text-xs font-medium px-3.5 py-1.5 rounded-full text-white"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      Mark as visited
                    </button>
                  </div>
                )}
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
  const [themeKey, setThemeKey] = useState(() => {
    try { return localStorage.getItem("perch:theme") === "matcha" ? "matcha" : "coffee"; }
    catch { return "coffee"; }
  });
  const theme = THEMES[themeKey];
  const Mascot = LogoBuddy; // same bird in both themes now — the branch already carries the brown/green theming
  useEffect(() => {
    try { localStorage.setItem("perch:theme", themeKey); } catch {}
  }, [themeKey]);

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
  const [savedShops, setSavedShops] = useState(() => loadMapFromStorage(STORAGE_KEYS.saved));
  const [visitedShops, setVisitedShops] = useState(() => loadMapFromStorage(STORAGE_KEYS.visited));
  const [view, setView] = useState("browse"); // "browse" | "saved" | "visited"

  // --- Account (optional) ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseEnabled);
  const [authError, setAuthError] = useState("");
  const cloudSyncedRef = useRef(false); // avoids writing straight back to the cloud right after loading from it

  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) return;

      const cloud = await loadCloudData(firebaseUser.uid);
      const localSaved = loadMapFromStorage(STORAGE_KEYS.saved);
      const localVisited = loadMapFromStorage(STORAGE_KEYS.visited);

      cloudSyncedRef.current = true;
      if (cloud) {
        // Merge in any local guest data this browser had that the cloud doesn't yet.
        localSaved.forEach((v, k) => { if (!cloud.savedShops.has(k)) cloud.savedShops.set(k, v); });
        localVisited.forEach((v, k) => { if (!cloud.visitedShops.has(k)) cloud.visitedShops.set(k, v); });
        setSavedShops(cloud.savedShops);
        setVisitedShops(cloud.visitedShops);
      } else {
        // First sign-in on this account — seed the cloud with local guest data, if any.
        setSavedShops(localSaved);
        setVisitedShops(localVisited);
      }
    });
    return unsubscribe;
  }, []);

  async function handleSignIn() {
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err.message || "Sign-in failed. Please try again.");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    cloudSyncedRef.current = false;
  }

  // Local cache always updates instantly.
  useEffect(() => { saveMapToStorage(STORAGE_KEYS.saved, savedShops); }, [savedShops]);
  useEffect(() => { saveMapToStorage(STORAGE_KEYS.visited, visitedShops); }, [visitedShops]);

  // Cloud writes are debounced (500ms) so typing a note doesn't fire a
  // Firestore write on every keystroke, and skipped right after a cloud
  // load so we don't immediately write the same data straight back.
  useEffect(() => {
    if (!user || !cloudSyncedRef.current) return;
    const t = setTimeout(() => saveCloudField(user.uid, "savedShops", savedShops), 500);
    return () => clearTimeout(t);
  }, [savedShops, user]);

  useEffect(() => {
    if (!user || !cloudSyncedRef.current) return;
    const t = setTimeout(() => saveCloudField(user.uid, "visitedShops", visitedShops), 500);
    return () => clearTimeout(t);
  }, [visitedShops, user]);

  function toggleSave(shop) {
    setSavedShops((prev) => {
      const next = new Map(prev);
      if (next.has(shop.id)) {
        next.delete(shop.id);
      } else {
        next.set(shop.id, { ...shop, cityAccent: city.accent, cityLabel: city.label });
      }
      return next;
    });
  }

  function toggleVisited(shop) {
    setVisitedShops((prev) => {
      const next = new Map(prev);
      if (next.has(shop.id)) {
        next.delete(shop.id);
      } else {
        next.set(shop.id, { ...shop, cityAccent: city.accent, cityLabel: city.label, note: "", myRating: 0, visitedAt: Date.now() });
      }
      return next;
    });
  }

  function updateNote(shopId, text) {
    setVisitedShops((prev) => {
      if (!prev.has(shopId)) return prev;
      const next = new Map(prev);
      next.set(shopId, { ...next.get(shopId), note: text });
      return next;
    });
  }

  function updateRating(shopId, rating) {
    setVisitedShops((prev) => {
      if (!prev.has(shopId)) return prev;
      const next = new Map(prev);
      const current = next.get(shopId);
      next.set(shopId, { ...current, myRating: current.myRating === rating ? 0 : rating });
      return next;
    });
  }

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

  const baseList =
    view === "saved" ? Array.from(savedShops.values()) :
    view === "visited" ? Array.from(visitedShops.values()) :
    citiesWithShops;

  const filtered = useMemo(() => {
    let list = baseList.filter((s) =>
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
  }, [baseList, query, filters, sort]);

  const [suggestions, setSuggestions] = useState([]);
  const suggestionTimerRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) return;
    if (cityInput.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = setTimeout(async () => {
      const results = await autocompleteCities(cityInput);
      setSuggestions(results);
    }, 300);
    return () => clearTimeout(suggestionTimerRef.current);
  }, [cityInput]);

  async function resolveCity(text) {
    const match = findCity(text);
    if (match) {
      setCityKey(match.key);
      setExpandedId(SHOPS.find((s) => s.city === match.key)?.id ?? null);
      setCityInput("");
      setSuggestions([]);
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
    setSuggestions([]);
    try {
      const results = await searchLivePlaces(text);
      if (results.length === 0) {
        setLiveError(`No coffee shops found for "${text}". Try a different spelling or a nearby city.`);
      } else {
        setLiveShops(results);
        setLiveLabel(text);
        setCityKey("live");
        setExpandedId(results[0].id);
        setCityInput("");
      }
    } catch (err) {
      setLiveError(err.message || "Live search failed. Check your API key and try again.");
    } finally {
      setLiveLoading(false);
    }
  }

  async function handleCitySubmit(e) {
    e.preventDefault();
    await resolveCity(cityInput);
  }

  function selectSuggestion(s) {
    resolveCity(s.fullText);
  }

  function selectCity(key) {
    setCityKey(key);
    setView("browse");
    setExpandedId(SHOPS.find((s) => s.city === key)?.id ?? null);
    setCityInput("");
    setSuggestions([]);
    setCityNotFound(false);
    setLiveError("");
  }

  const [logoBounce, setLogoBounce] = useState(false);
  function handleLogoClick() {
    setLogoBounce(true);
    setTimeout(() => setLogoBounce(false), 650);
  }

  return (
    <div
      className={`min-h-screen ${theme.bgClass} text-[#171512]`}
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui", "--accent": theme.accent, "--accent-glow": theme.accent + "59", "--chip-bg": theme.chipBg, "--card-bg": theme.cardBg }}
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
        .steam-wisp:nth-child(3) { animation-delay: 0.8s; }
        @keyframes wingFlapLeft {
          0%, 100% { transform: rotate(-6deg) scaleY(1); }
          50% { transform: rotate(-45deg) scaleY(1.12); }
        }
        @keyframes wingFlapRight {
          0%, 100% { transform: rotate(6deg) scaleY(1); }
          50% { transform: rotate(45deg) scaleY(1.12); }
        }
        .wing-left { transform-box: fill-box; transform-origin: 90% 25%; animation: wingFlapLeft 0.9s ease-in-out infinite; }
        .wing-right { transform-box: fill-box; transform-origin: 10% 25%; animation: wingFlapRight 0.9s ease-in-out infinite; }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .logo-float { animation: logoFloat 3s ease-in-out infinite; }
        @keyframes logoBounce {
          0% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.18) rotate(-10deg); }
          50% { transform: scale(0.92) rotate(8deg); }
          75% { transform: scale(1.06) rotate(-4deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .logo-bounce { animation: logoBounce 0.6s ease-in-out; }
      `}</style>

      {/* Header */}
      <header
        className="px-6 py-5 flex items-center justify-between flex-wrap gap-y-3 shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
        style={{ backgroundColor: "var(--accent)" }}
      >
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleLogoClick}
            aria-label="Perch logo"
            className="relative logo-float cursor-pointer"
          >
            <div
              className={`w-20 h-20 rounded-full bg-[#FFF8F1] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.2)] ${logoBounce ? "logo-bounce" : ""}`}
            >
              <Mascot size={52} className="text-[var(--accent)]" />
            </div>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white" style={{ fontFamily: "'Fraunces', serif" }}>Perch</h1>
            <p className="text-[11px] text-[#FFE9D6] -mt-0.5">{theme.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/10 border border-white/30 rounded-full p-0.5">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.key}
                onClick={() => setThemeKey(t.key)}
                title={`${t.label} theme`}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-all
                  ${themeKey === t.key ? "bg-white text-[var(--accent)]" : "text-white/80 hover:text-white"}`}
              >
                <span>{t.emoji}</span>
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white/10 border border-white/30 rounded-full p-0.5">
            <button
              onClick={() => setView("browse")}
              title="Home"
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all
                ${view === "browse" ? "bg-white text-[var(--accent)]" : "text-white/80 hover:text-white"}`}
            >
              <Home size={14} />
            </button>
            <button
              onClick={() => setView("visited")}
              title="Visited"
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all
                ${view === "visited" ? "bg-white text-[var(--accent)]" : "text-white/80 hover:text-white"}`}
            >
              <CheckCircle2 size={14} fill={view === "visited" ? "var(--accent)" : "none"} strokeWidth={view === "visited" ? 0 : 2} />
              {visitedShops.size > 0 && <span>{visitedShops.size}</span>}
            </button>
            <button
              onClick={() => setView("saved")}
              title="Saved"
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all
                ${view === "saved" ? "bg-white text-[var(--accent)]" : "text-white/80 hover:text-white"}`}
            >
              <Heart size={14} fill={view === "saved" ? "var(--accent)" : "none"} />
              {savedShops.size > 0 && <span>{savedShops.size}</span>}
            </button>
          </div>

          {firebaseEnabled && (
            <div className="flex items-center">
              {authLoading ? (
                <span className="text-[11px] text-white/60 font-mono">…</span>
              ) : user ? (
                <button
                  onClick={handleSignOut}
                  title="Sign out"
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/30 rounded-full pl-1 pr-2.5 py-1 transition-all"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[9px] text-white font-semibold">
                      {(user.displayName || user.email || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-[11px] text-white font-medium max-w-[90px] truncate hidden lg:inline">
                    {user.displayName || user.email}
                  </span>
                  <LogOut size={12} className="text-white/70" />
                </button>
              ) : (
                <button
                  onClick={handleSignIn}
                  title="Sign in with Google"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white text-[var(--accent)] hover:bg-[var(--chip-bg)] transition-all"
                >
                  <LogIn size={13} />
                  <span className="hidden lg:inline">Sign in</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      {firebaseEnabled && authError && (
        <div className="max-w-2xl mx-auto px-6 pt-2">
          <p className="text-[11px] text-[#C0392B]">{authError}</p>
        </div>
      )}

      {/* City switcher */}
      {view === "browse" && (
      <div className="max-w-2xl mx-auto px-6 pt-5">
        <form onSubmit={handleCitySubmit} className="relative mb-2">
          <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)]" />
          <input
            value={cityInput}
            onChange={(e) => { setCityInput(e.target.value); setCityNotFound(false); setLiveError(""); }}
            placeholder={
              GOOGLE_PLACES_API_KEY
                ? `Currently browsing ${city.label} — try "Rome, GA" or "Austin, TX"...`
                : `Currently browsing ${city.label} — add an API key to search any US city`
            }
            className="w-full bg-white border border-[#F0E4D8] rounded-full pl-10 pr-4 py-2.5 text-sm text-[#171512] placeholder-[#B5AFA0] outline-none shadow-[0_2px_8px_rgba(120,90,60,0.06)] focus:border-[var(--accent)] transition-shadow"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#F0E4D8] rounded-2xl shadow-[0_8px_24px_rgba(120,90,60,0.12)] overflow-hidden z-20">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--chip-bg)] transition-colors flex items-baseline gap-2"
                >
                  <span className="text-sm text-[#171512] font-medium">{s.mainText}</span>
                  <span className="text-xs text-[#8A8478]">{s.secondaryText}</span>
                </button>
              ))}
            </div>
          )}
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
            search any US city live — until then, try "Norcross", "Austin", "Seattle", or "Chicago".
          </p>
        )}
        {cityKey === "live" && liveShops.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LIVE_ACCENT }} />
            <span className="text-[11px] font-mono text-[#8A8478]">Live results from Google Places for "{liveLabel}"</span>
          </div>
        )}
      </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-6">
        <div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#B5AFA0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={view === "saved" ? "Search your saved spots..." : view === "visited" ? "Search places you've visited..." : "Search shops or streets..."}
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

          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-[#B5AFA0] font-mono">
              {view === "saved" ? `${filtered.length} saved spots` : view === "visited" ? `${filtered.length} places you've visited` : `${filtered.length} spots in ${city.label}`} · sorted by {sort}
            </p>
            {view === "saved" && savedShops.size > 0 && (
              <button
                onClick={() => { if (confirm("Clear all saved spots? This can't be undone.")) setSavedShops(new Map()); }}
                className="text-[11px] font-mono text-[#B5AFA0] hover:text-[var(--accent)] underline"
              >
                Clear all
              </button>
            )}
            {view === "visited" && visitedShops.size > 0 && (
              <button
                onClick={() => { if (confirm("Clear all visited spots and notes? This can't be undone.")) setVisitedShops(new Map()); }}
                className="text-[11px] font-mono text-[#B5AFA0] hover:text-[var(--accent)] underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-3">
            {filtered.map((shop) => (
              <TicketStub
                key={shop.id}
                shop={shop}
                distance={shop.distance}
                expanded={expandedId === shop.id}
                onToggle={() => setExpandedId((cur) => (cur === shop.id ? null : shop.id))}
                saved={savedShops.has(shop.id)}
                onToggleSave={() => toggleSave(shop)}
                visited={visitedShops.has(shop.id)}
                onToggleVisited={() => toggleVisited(shop)}
                note={visitedShops.get(shop.id)?.note ?? ""}
                onNoteChange={(text) => updateNote(shop.id, text)}
                myRating={visitedShops.get(shop.id)?.myRating ?? 0}
                onRatingChange={(r) => updateRating(shop.id, r)}
                cityLabel={view !== "browse" ? shop.cityLabel : undefined}
                showDistance={view === "browse"}
                MascotIcon={Mascot}
              />
            ))}
            {filtered.length === 0 && view === "saved" && (
              <div className="flex flex-col items-center text-center py-12">
                <Mascot size={96} className="text-[var(--accent)] mb-3 opacity-80" />
                <p className="text-sm text-[#8A8478] max-w-xs">
                  No saved spots yet — tap the little heart on any card while browsing to keep it here.
                </p>
              </div>
            )}
            {filtered.length === 0 && view === "visited" && (
              <div className="flex flex-col items-center text-center py-12">
                <Mascot size={96} className="text-[var(--accent)] mb-3 opacity-80" />
                <p className="text-sm text-[#8A8478] max-w-xs">
                  Nothing marked as visited yet — tap the checkmark on any card while browsing, then jot a note in its Notes tab.
                </p>
              </div>
            )}
            {filtered.length === 0 && view === "browse" && (
              <div className="flex flex-col items-center text-center py-12">
                <Mascot size={96} className="text-[var(--accent)] mb-3 opacity-80" />
                <p className="text-sm text-[#8A8478] max-w-xs">
                  No cozy spots match those vibes yet — try loosening a filter.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="px-6 py-6 text-center text-[11px] text-[#B5AFA0] font-mono">
        Made with {theme.heartEmoji}. Data from Google Places, with workspace details from real reviews.
      </footer>
    </div>
  );
}

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-16.png", "icon-32.png", "icon-180.png"],
      manifest: {
        name: "Perch — find your next cozy spot to work from",
        short_name: "Perch",
        description: "Find coffee shops with outlets, parking, and quiet seating to work from.",
        theme_color: "#6F4630",
        background_color: "#FFF8F1",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le `base` est nécessaire pour GitHub Pages quand le site est servi
// depuis https://<user>.github.io/<repo>/. Pour un domaine custom (CNAME),
// remettre simplement "/".
export default defineConfig({
  plugins: [react()],
  base: "/reev-momo-dashboard/",
});

import type { MetadataRoute } from "next";
import { getSiteUrl, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // El informe mensual (pagina y JSON) queda permitido; la regla mas
      // especifica gana sobre "/api/", asi el resto del API sigue bloqueado.
      allow: ["/", "/informe", "/api/informe", "/cobertura"],
      disallow: ["/admin", "/empleado", "/cliente", "/profile", "/login", "/register", "/api/"],
    },
    sitemap: getSiteUrl("/sitemap.xml"),
    host: siteConfig.domain,
  };
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/auth";
import { getAdminModuleAccess } from "@/lib/admin-module-access";
import { 
  Settings, 
  Package, 
  FileText, 
  ShoppingCart, 
  LayoutDashboard,
  ArrowRight
} from "lucide-react";

export default async function AdminPage() {
  const session = await auth();
  
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const moduleAccess = await getAdminModuleAccess(session.user.id, session.user.role);

  const adminModules = [
    {
      id: "config",
      title: "Configuración",
      description: "Administra usuarios, permisos y datos de la empresa.",
      href: "/admin/configuracion",
      icon: Settings,
      show: moduleAccess.config_users || moduleAccess.config_business || moduleAccess.config_permissions,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    {
      id: "products",
      title: "Productos",
      description: "Gestiona el catálogo, inventarios y categorías.",
      href: "/admin/productos",
      icon: Package,
      show: moduleAccess.products,
      color: "text-amber-600",
      bgColor: "bg-amber-100"
    },
    {
      id: "quotes",
      title: "Cotizaciones",
      description: "Crea y haz seguimiento a presupuestos de clientes.",
      href: "/admin/cotizaciones",
      icon: FileText,
      show: moduleAccess.quotes,
      color: "text-purple-600",
      bgColor: "bg-purple-100"
    },
    {
      id: "sales",
      title: "Ventas",
      description: "Visualiza el historial de ventas y reportes financieros.",
      href: "/admin/ventas",
      icon: ShoppingCart,
      show: moduleAccess.sales,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100"
    }
  ];

  return (
    <section className="container">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <LayoutDashboard className="w-6 h-6" />
          <h1 className="text-3xl font-bold tracking-tight">Panel de Administración</h1>
        </div>
        <p className="text-muted-foreground">
          Bienvenido, {session.user.name}. Gestiona los módulos de tu sistema desde aquí.
        </p>
      </div>

      <div className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {adminModules.map((module) => (
          module.show && (
            <Card key={module.id} className="group hover:shadow-lg transition-all duration-300 border-border/50">
              <Link
                href={module.href}
                className="h-full flex flex-col"
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg ${module.bgColor} ${module.color} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                    <module.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl">{module.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {module.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  <div className="flex items-center text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
                    Gestionar <ArrowRight className="ml-2 w-4 h-4" />
                  </div>
                </CardContent>
              </Link>
            </Card>
          )
        ))}
      </div>
    </section>
  );
}

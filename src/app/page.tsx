import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

export default async function HomePage() {
  const session = await auth();
  const role = session?.user?.role;
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      images: {
        orderBy: { order: "asc" },
      },
    },
  });
  const systemCurrency = await getSystemCurrency();

  return (
    <section className="app-page space-y-5">
      <Card className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          Inicio ecommerce
        </h1>
        <p className="text-sm text-slate-600 md:text-base">
          Explora el catalogo de productos. Cada producto usa su primera imagen como miniatura.
        </p>
        {role ? (
          <p className="text-xs text-slate-500">
            Sesion activa como {role}. Puedes navegar al dashboard desde el menu lateral.
          </p>
        ) : null}
      </Card>

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No hay productos publicados todavia.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="space-y-3 p-0">
              <img
                src={product.thumbnailUrl}
                alt={product.name}
                className="h-44 w-full rounded-t-xl border-b border-[var(--line)] object-cover"
              />
              <div className="space-y-1 px-4 pb-4">
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">{product.name}</h2>
                <p className="text-sm font-medium text-slate-700">
                  {formatMoney(String(product.price), systemCurrency)}
                </p>
                {product.description ? (
                  <p className="line-clamp-2 text-xs text-slate-500">{product.description}</p>
                ) : null}
                <p className="text-xs text-slate-400">{product.images.length} imagen(es)</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSystemBrandName } from "@/lib/system-settings";
import { getLegalDoc, LEGAL_LINKS } from "@/lib/legal-docs";
import { getSiteUrl } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return LEGAL_LINKS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brandName = await getSystemBrandName();
  const doc = getLegalDoc(slug, brandName);
  // El layout raiz agrega "| Marca" (template); aqui va sin marca para no repetirla.
  if (!doc) {
    return { title: "Documento", robots: { index: false, follow: false } };
  }
  return {
    title: doc.title,
    description: doc.description,
    // Canonical propio (sin esto hereda "/" del layout raiz).
    alternates: { canonical: getSiteUrl(`/legal/${slug}`) },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { slug } = await params;
  const brandName = await getSystemBrandName();
  const doc = getLegalDoc(slug, brandName);
  if (!doc) {
    notFound();
  }

  return (
    <article className="mx-auto w-full max-w-3xl py-4 md:py-6">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{doc.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">Última actualización: {doc.updated}</p>
      </header>

      <div className="space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-base font-semibold text-foreground">{section.heading}</h2>
            <div className="space-y-2">
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

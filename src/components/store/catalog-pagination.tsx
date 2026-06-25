import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CatalogPaginationProps = {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
};

function getPageWindow(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: (number | "...")[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("...");
  }
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < totalPages - 1) {
    pages.push("...");
  }
  pages.push(totalPages);

  return pages;
}

export function CatalogPagination({ currentPage, totalPages, buildHref }: CatalogPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = getPageWindow(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const baseItem =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--line)] px-3 text-sm font-medium transition";

  return (
    <nav className="flex items-center justify-center gap-1.5 pt-2" aria-label="Paginacion del catalogo">
      {hasPrev ? (
        <Link href={buildHref(currentPage - 1)} aria-label="Pagina anterior" className={`${baseItem} bg-card hover:bg-muted`}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${baseItem} cursor-not-allowed bg-muted text-muted-foreground opacity-50`}>
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}

      {pages.map((page, index) =>
        page === "..." ? (
          <span key={`ellipsis-${index}`} className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : page === currentPage ? (
          <span
            key={page}
            aria-current="page"
            className={`${baseItem} border-transparent bg-[var(--primary)] text-white`}
          >
            {page}
          </span>
        ) : (
          <Link key={page} href={buildHref(page)} className={`${baseItem} bg-card hover:bg-muted`}>
            {page}
          </Link>
        ),
      )}

      {hasNext ? (
        <Link href={buildHref(currentPage + 1)} aria-label="Pagina siguiente" className={`${baseItem} bg-card hover:bg-muted`}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${baseItem} cursor-not-allowed bg-muted text-muted-foreground opacity-50`}>
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

import Link from "next/link";
import { MoreHorizontal, XCircle } from "lucide-react";
import { adminUpdateProductionJobStatusAction } from "@/app/actions/production-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { getProductionJobStatusBadgeClassName, getProductionJobStatusLabel } from "@/lib/orders";

type ProductionJobRow = {
  id: string;
  code: string;
  orderCode: string;
  orderId: string;
  productName: string;
  quantity: number;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "DONE" | "CANCELLED";
  dueDate: string | null;
  assignedToName: string | null;
  notes: string | null;
};

type ProductionWorkspaceProps = {
  jobs: ProductionJobRow[];
  stats: {
    jobsCount: number;
    pendingCount: number;
    activeCount: number;
    doneCount: number;
  };
};

function JobActions({ job }: { job: ProductionJobRow }) {
  const canCancel = job.status !== "DONE" && job.status !== "CANCELLED";

  if (!canCancel) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${job.code}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
          <form action={adminUpdateProductionJobStatusAction}>
            <input type="hidden" name="returnTo" value="/admin/produccion" />
            <input type="hidden" name="productionJobId" value={job.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductionWorkspace({ jobs, stats }: ProductionWorkspaceProps) {
  return (
    <section className="space-y-4">
      <OperationsTabs />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Trabajos</p>
            <p className="text-2xl font-semibold text-foreground">{stats.jobsCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-semibold text-foreground">{stats.pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">En curso</p>
            <p className="text-2xl font-semibold text-foreground">{stats.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Terminados</p>
            <p className="text-2xl font-semibold text-foreground">{stats.doneCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-9 w-28 py-2 pr-2">Trabajo</TableHead>
              <TableHead className="h-9 w-28 px-2 py-2">Orden</TableHead>
              <TableHead className="h-9 py-2">Producto</TableHead>
              <TableHead className="h-9 py-2">CANT</TableHead>
              <TableHead className="h-9 py-2">Responsable</TableHead>
              <TableHead className="h-9 py-2">Vencimiento</TableHead>
              <TableHead className="h-9 py-2">Estado</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-9 text-center text-muted-foreground">
                  Aun no hay trabajos de produccion.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="py-2 pr-2 text-sm font-semibold text-foreground">{job.code}</TableCell>
                  <TableCell className="px-2 py-2">
                    <Link href={`/admin/ordenes/${job.orderId}`} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                      {job.orderCode}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-foreground">{job.productName}</TableCell>
                  <TableCell className="py-2 text-sm font-semibold text-foreground">{job.quantity}</TableCell>
                  <TableCell className="py-2 text-sm text-foreground">{job.assignedToName ?? "Sin asignar"}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{job.dueDate ?? "-"}</TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getProductionJobStatusBadgeClassName(job.status)}`}
                    >
                      {getProductionJobStatusLabel(job.status)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <JobActions job={job} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

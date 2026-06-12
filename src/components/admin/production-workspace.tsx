import Link from "next/link";
import { Factory, PauseCircle, PlayCircle, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
import { adminUpdateProductionJobStatusAction } from "@/app/actions/production-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProductionJobStatusBadgeClassName, getProductionJobStatusLabel } from "@/lib/orders";

type ProductionJobRow = {
  id: string;
  code: string;
  orderCode: string;
  orderId: string;
  clientName: string;
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
  const canStart = job.status === "PENDING" || job.status === "PAUSED";
  const canPause = job.status === "IN_PROGRESS";
  const canComplete = job.status === "IN_PROGRESS" || job.status === "PAUSED";
  const canCancel = job.status !== "DONE" && job.status !== "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canStart ? (
        <form action={adminUpdateProductionJobStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/produccion" />
          <input type="hidden" name="productionJobId" value={job.id} />
          <input type="hidden" name="status" value="IN_PROGRESS" />
          <Button type="submit" variant="outline" size="sm" className="h-7">
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            Iniciar
          </Button>
        </form>
      ) : null}
      {canPause ? (
        <form action={adminUpdateProductionJobStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/produccion" />
          <input type="hidden" name="productionJobId" value={job.id} />
          <input type="hidden" name="status" value="PAUSED" />
          <Button type="submit" variant="outline" size="sm" className="h-7">
            <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
            Pausar
          </Button>
        </form>
      ) : null}
      {canComplete ? (
        <form action={adminUpdateProductionJobStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/produccion" />
          <input type="hidden" name="productionJobId" value={job.id} />
          <input type="hidden" name="status" value="DONE" />
          <Button type="submit" size="sm" className="h-7 bg-emerald-600 text-white hover:bg-emerald-600/90">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Terminar
          </Button>
        </form>
      ) : null}
      {canCancel ? (
        <form action={adminUpdateProductionJobStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/produccion" />
          <input type="hidden" name="productionJobId" value={job.id} />
          <input type="hidden" name="status" value="CANCELLED" />
          <Button type="submit" variant="destructive" size="sm" className="h-7">
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Cancelar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function ProductionWorkspace({ jobs, stats }: ProductionWorkspaceProps) {
  return (
    <section className="space-y-4">
      <Card className="border-border bg-card/95">
        <CardContent className="space-y-2">
          <div className="flex flex-row items-center gap-2">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">Produccion</h1>
              <p className="text-sm text-muted-foreground">
                Gestiona los trabajos de fabricacion ligados a las ordenes activas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Trabajo</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-9 text-center text-muted-foreground">
                  Aun no hay trabajos de produccion.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-sm font-semibold text-foreground">{job.code}</TableCell>
                  <TableCell>
                    <Link href={`/admin/ordenes/${job.orderId}`} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                      {job.orderCode}
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{job.clientName}</TableCell>
                  <TableCell className="text-sm text-foreground">{job.productName}</TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{job.quantity}</TableCell>
                  <TableCell className="text-sm text-foreground">{job.assignedToName ?? "Sin asignar"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{job.dueDate ?? "-"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getProductionJobStatusBadgeClassName(job.status)}`}
                    >
                      {getProductionJobStatusLabel(job.status)}
                    </span>
                  </TableCell>
                  <TableCell>
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

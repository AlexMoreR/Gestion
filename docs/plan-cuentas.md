# Plan: Módulo de Cuentas (integrado a Balances)

> Estado: **propuesta para coordinar con Emanuel** (dueño del módulo `src/modules/balances`).
> Decisiones tomadas:
> - La cuenta se **elige en cada abono** (no mapeo fijo).
> - El desplegable de cuenta **se filtra según el método de pago**.
> - Implementación **por fases** (ver abajo).

## 1. Objetivo

Saber a qué **cuenta real** (Efectivo/Caja, Bancolombia, Nequi, Daviplata, …) entra o sale
cada peso, para tener orden y poder **conciliar** (que lo de la app coincida con el banco/caja).

## 2. Enfoque por fases (importante)

Hay dos niveles, y conviene NO saltarse el orden:

### Fase 1 — "A qué cuenta entró el dinero" (recomendada ya)
Bajo esfuerzo, alto valor, confiable. Responde directamente la necesidad.
- Crear **Cuentas** (nombre + tipo).
- En cada **abono** se elige la **Cuenta** destino (filtrada por método).
- Reporte **"Ingresos por cuenta"** (cuánto entró a cada cuenta).

### Fase 2 — "Balance real de cada cuenta" (cuando quieran tesorería completa)
Más potente, pero **solo es confiable si se registra TODO**.
- Gastos por cuenta (pago a proveedor, envío, etc.).
- **Saldo inicial** por cuenta.
- **Traslados entre cuentas** (ej. pasar de Nequi a Caja).
- Ajustes manuales / retiros del dueño.
- Balance = saldo inicial + ingresos − gastos − traslados salientes + traslados entrantes.

> ⚠️ **Advertencia:** el balance real solo "cuadra" si se registran todos los movimientos
> (gastos, traslados, ajustes). Si se escapa uno, el balance queda mal — y un balance
> equivocado es **peor que no tenerlo** (genera desconfianza). Por eso la Fase 2 se hace solo
> si hay compromiso de registrar todo.

## 3. Modelo de datos (Prisma)

```prisma
enum AccountType {
  CASH      // Efectivo / Caja
  BANK      // Banco
  WALLET    // Billetera (Nequi, Daviplata)
  OTHER
}

model Account {
  id             String      @id @default(cuid())
  name           String      @unique
  type           AccountType @default(CASH)
  isActive       Boolean     @default(true)
  openingBalance Decimal     @default(0) @db.Decimal(14, 2)  // se usa en Fase 2
  createdById    String
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  createdBy      User        @relation(fields: [createdById], references: [id], onDelete: Restrict)
  salePayments          SalePayment[]
  supplierLedgerEntries SupplierLedgerEntry[]   // Fase 2
  shippingCosts         ShippingCost[]          // Fase 2
}
```

La cuenta es una **dimensión extra** sobre los movimientos que ya existen — NO se crea tabla
nueva de movimientos. Se agrega `accountId` (opcional) a:

- `SalePayment` → ingreso (Fase 1).
- `SupplierLedgerEntry` (tipo `PAYMENT`) → gasto (Fase 2).
- `ShippingCost` → gasto (Fase 2).

```prisma
accountId String?
account   Account? @relation(fields: [accountId], references: [id], onDelete: SetNull)
// + @@index([accountId])
```

Para Fase 2 (traslados/ajustes) puede necesitarse un modelo `AccountMovement` simple
(fecha, cuenta, tipo IN/OUT, monto, nota) para lo que no es venta/gasto.

## 4. Nombres y tipos de cuenta
- `Caja-1`, `Caja-2` → `CASH`
- `Nequi-123454`, `Daviplata-...` → `WALLET`
- `Bancolombia-11212121`, `Davivienda-...` → `BANK`

## 5. UI

### 5.1 Abono ("Enviar a ventas" — `quotes-data-table.tsx`) — Fase 1
- `select` **"Cuenta"** por abono (cuentas activas), **filtrado por método de pago**:
  - `EFECTIVO` → solo `CASH` (Cajas)
  - `TRANSFERENCIA` → `WALLET` o `BANK` (Nequi, Bancolombia…)
  - `TARJETA` → `BANK`
  - `OTRO` → todas
  - (Mapa método→tipos en un solo lugar; al cambiar el método se resetea la cuenta si ya no aplica.)
- Guardar `accountId` por abono (input oculto `paymentReceiptAccounts`).
- En `sales-actions.ts`: leer, validar cuenta activa **y que su tipo corresponda al método**,
  guardar en `SalePayment.accountId`.

### 5.2 Balances → pestaña "Cuentas" (módulo de Emanuel)
- **Fase 1:** tabla Cuenta · Tipo · **Ingresos** + CRUD (crear/editar/activar-desactivar).
- **Fase 2:** agregar columnas Gastos y **Balance**, saldo inicial, traslados y detalle de
  movimientos por cuenta.

### 5.3 Gastos de proveedor / envío — Fase 2
- En los modales de pago (Recoger ítem, Despachar orden) agregar el `select` de cuenta cuando
  es "pagar ahora", para descontar de la cuenta correcta.

## 6. Server actions
- `accounts-actions.ts` (nuevo): crear / editar / activar-desactivar cuenta.
- `sales-actions.ts`: aceptar y guardar `accountId` por abono (Fase 1).
- Acciones de pago a proveedor/envío: aceptar `accountId` (Fase 2).

## 7. Migración (Fase 1)
```sql
CREATE TYPE "AccountType" AS ENUM ('CASH','BANK','WALLET','OTHER');
CREATE TABLE "Account" (...);
ALTER TABLE "SalePayment" ADD COLUMN "accountId" TEXT;  -- + índice + FK (ON DELETE SET NULL)
```
(Fase 2 agrega `accountId` a `SupplierLedgerEntry` y `ShippingCost`, y opcionalmente
`AccountMovement`.)

## 8. Coordinación con el módulo de Emanuel
- La pestaña "Cuentas" vive en `src/modules/balances/presentation` → idealmente la implementa
  Emanuel o se acuerda la ubicación para no chocar.
- Su cálculo de utilidad **no se afecta** (las cuentas son ortogonales: miden dónde está la plata,
  no la ganancia).
- "Saldo de proveedor" (suyo) y "gasto por cuenta" son vistas distintas de las mismas filas
  `PAYMENT`; solo cambia el agrupamiento.

## 9. Decisiones pendientes
1. ¿`accountId` **obligatorio** en abonos nuevos? (recomendado: sí, en Fase 1).
2. Saldo inicial por cuenta (Fase 2).
3. Backfill de movimientos existentes: cuenta por defecto ("Sin asignar") o dejarlos sin cuenta.
4. ¿Se comprometen a registrar TODO para habilitar la Fase 2? (si no, quedarse en Fase 1).

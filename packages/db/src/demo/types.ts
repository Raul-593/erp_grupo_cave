import type {
  ActivityStatus,
  CheckResult,
  ContractStatus,
  MountStatus,
  PaymentMethod,
  PaymentSupport,
  QuoteStatus,
  SupplierKind,
} from '../domain.ts';

/**
 * Conjunto de datos de demostración (AGENTS.md §2, «Vista previa con datos de demostración»).
 * Las referencias entre secciones usan nombres y claves locales (`key`), no identificadores
 * de base de datos. El archivo con los datos reales del prototipo no se versiona.
 */
export interface DemoDataset {
  /** Identifica el origen; se guarda como `model` de la extracción (p. ej. `prototipo-cave-erp-v3`). */
  source: string;
  /** Ficha con la forma del contrato de extracción (AGENTS.md §8). */
  ficha: DemoFicha;
  /** Empresa ejecutora; se crea si no existe. */
  company: string | null;
  /** Nombres completos; se reutiliza el trabajador activo del mismo nombre si existe. */
  workers: string[];
  suppliers: DemoSupplier[];
  /** En el orden del documento. */
  items: DemoItem[];
  payments: DemoPayment[];
  activities: DemoActivity[];
  preEventChecks: DemoPreEventCheck[];
  quoteRequests: DemoQuoteRequest[];
}

export interface DemoFicha {
  contratante: string | null;
  ruc_contratante: string | null;
  codigo_proceso: string | null;
  objeto: string | null;
  monto: number | null;
  moneda: string | null;
  incluye_iva: boolean | null;
  sedes: string[];
  fecha_inicio: string | null;
  fecha_fin: string | null;
  plazo: string | null;
  administrador_contrato: string | null;
  observacion: string | null;
}

export interface DemoSupplier {
  name: string;
  kind: SupplierKind;
}

export interface DemoItem {
  /** Clave local para referenciar el ítem desde actividades y cotizaciones. */
  key: string;
  rubro: string;
  producto: string;
  subproducto: string | null;
  descripcion: string;
  cant: number | null;
  unidad: string | null;
  dias: number | null;
  observacion: string | null;
  /** Nombre de un trabajador de `workers`. */
  responsible: string | null;
  plan: { supplier: string | null; cost: number | null; contract: ContractStatus } | null;
  /** Lo pagado del ítem no se indica aquí: sale del reparto de `payments`. */
  order: { code: string; amount: number; paidBy: string | null } | null;
  mountStatus: MountStatus | null;
}

export interface DemoPayment {
  order: string;
  paidOn: string;
  concept: string;
  method: PaymentMethod;
  amount: number;
  support: PaymentSupport;
  /** Reparto entre ítems (`key`) de la misma orden; puede sumar menos que el monto. */
  allocations: { item: string; amount: number }[];
}

export interface DemoActivity {
  key: string;
  name: string;
  responsible: string | null;
  wholeTeam: boolean;
  startDate: string;
  endDate: string;
  milestone: boolean;
  status: ActivityStatus | null;
  /** `key` de otra actividad. */
  dependsOn: string | null;
  /** `key` de los ítems vinculados. */
  items: string[];
}

export interface DemoPreEventCheck {
  description: string;
  responsible: string | null;
  /** Instante ISO 8601 con zona (p. ej. `2026-11-16T18:00:00-05:00`). */
  dueAt: string | null;
  result: CheckResult;
}

export interface DemoQuoteRequest {
  supplier: string;
  rubro: string;
  sentOn: string | null;
  status: QuoteStatus;
  lines: { item: string; amount: number; awarded: boolean }[];
}

/** Respuesta con la forma del contrato de extracción (`ficha` + `items`). */
export interface DemoRawResponse {
  ficha: DemoFicha;
  items: {
    item: number;
    rubro: string;
    producto: string;
    subproducto: string | null;
    descripcion: string;
    cant: number | null;
    unidad: string | null;
    dias: number | null;
    observacion: string | null;
  }[];
}

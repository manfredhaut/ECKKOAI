import { pool } from "../../db/pool.js";
import type { CreditType } from "./creditGate.js";

export interface CreditPackage {
  id: string;
  creditType: CreditType;
  quantity: number;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
}

interface CreditPackageRow {
  id: string;
  credit_type: CreditType;
  quantity: number;
  price_cents: number;
  stripe_price_id: string | null;
  active: boolean;
}

function toCreditPackage(row: CreditPackageRow): CreditPackage {
  return {
    id: row.id,
    creditType: row.credit_type,
    quantity: row.quantity,
    priceCents: row.price_cents,
    stripePriceId: row.stripe_price_id,
    active: row.active,
  };
}

// One active package per credit_type today — fixed quantity, no variable
// amount (Fase 5 plan, Seção 5). If a second bundle per type is ever added
// (e.g. a bigger pack), this needs a real selection param instead of
// picking "the cheapest active one".
export async function findActiveCreditPackage(creditType: CreditType): Promise<CreditPackage | undefined> {
  const { rows } = await pool.query<CreditPackageRow>(
    "SELECT * FROM credit_packages WHERE credit_type = $1 AND active = true ORDER BY price_cents ASC LIMIT 1",
    [creditType],
  );
  return rows[0] ? toCreditPackage(rows[0]) : undefined;
}

export async function getAllCreditPackages(): Promise<CreditPackage[]> {
  const { rows } = await pool.query<CreditPackageRow>(
    "SELECT * FROM credit_packages ORDER BY credit_type ASC, price_cents ASC",
  );
  return rows.map(toCreditPackage);
}

export async function setCreditPackageStripePrice(id: string, stripePriceId: string): Promise<void> {
  await pool.query("UPDATE credit_packages SET stripe_price_id = $1, updated_at = now() WHERE id = $2", [
    stripePriceId,
    id,
  ]);
}

import { getSuggestions } from "@prox/db";
import { Workbench } from "@/components/app/Workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Master mode: no product selected. Prox searches across every product at once
// (and answers general questions). A static route, so it can never collide with
// a product slug. Suggestions = the most-asked questions across ALL products;
// falls back to the generic set in the Workbench when there aren't enough yet.
export default function MasterWorkbench() {
  const starters = getSuggestions(null, 4);
  return <Workbench slug={null} productName="Prox" starters={starters.length ? starters : undefined} />;
}

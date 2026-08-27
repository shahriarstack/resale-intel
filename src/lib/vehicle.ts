// How a vehicle is named in the UI.
//
// The fleet is almost entirely Foton and Mahindra, so the make carries no
// signal — the model is what distinguishes one unit from another. The model is
// therefore the heading everywhere, with the make demoted to a secondary chip.

interface Named {
  make?: string | null;
  model?: string | null;
}

/** The heading: model first, falling back to make, then a generic label. */
export function vehicleTitle(v: Named): string {
  const model = v.model?.trim();
  if (model) return model;
  const make = v.make?.trim();
  if (make) return make;
  return "Vehicle";
}

/** The secondary label — the make, unless it is already being used as the heading. */
export function vehicleMake(v: Named): string | null {
  const model = v.model?.trim();
  const make = v.make?.trim();
  if (!make) return null;
  return model ? make : null;
}

/** Single-line form for dense lists and feeds: "Aumark S · Foton". */
export function vehicleLabel(v: Named): string {
  const make = vehicleMake(v);
  return make ? `${vehicleTitle(v)} · ${make}` : vehicleTitle(v);
}

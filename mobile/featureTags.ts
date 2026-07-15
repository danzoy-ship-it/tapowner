// Display labels for the canonical property-feature tags the server derives
// from county improvement records (IMPROVEMENT_TAXONOMY.md). Shared by the
// farm filter chips and the property card. Unknown tags (a future crosswalk
// addition shipping before the next app build) fall back to the raw tag text.
export const TAG_LABELS: Record<string, string> = {
  pool: 'Pool',
  garage: 'Garage',
  garage_detached: 'Detached garage',
  single_story: 'Single story',
  casita: 'Casita / guest house',
  shed_workshop: 'Shed / workshop',
  carport: 'Carport',
  spa: 'Spa / hot tub',
  fireplace: 'Fireplace',
  solar: 'Solar',
  rv: 'RV parking',
  basement: 'Basement',
  boat_dock: 'Boat dock',
  barn_stable: 'Barn / stable',
  sport_court: 'Sport court',
  waterfront: 'Waterfront',
  corner_lot: 'Corner lot',
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, ' ');
}

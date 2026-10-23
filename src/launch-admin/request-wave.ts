export interface RequestWave {
  id: string;
  name: string;
  status: string;
  capacity: number;
  selected: number;
}
export function defaultRequestWave(
  waves: RequestWave[],
  current: string | null = null,
) {
  const available = waves.filter(
    (w) =>
      w.status === "draft" && (w.selected < w.capacity || w.id === current),
  );
  return (
    available.find((w) => w.id === current)?.id ||
    available.find((w) => /^(the )?first 100$/i.test(w.name.trim()))?.id ||
    available[0]?.id ||
    ""
  );
}

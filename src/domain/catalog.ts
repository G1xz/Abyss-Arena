/** Constantes de catálogo seguras para o cliente. */

export const ELEMENTS = ["PYRO", "HYDRO", "ANEMO", "ELECTRO", "DENDRO", "CRYO", "GEO"] as const;
export type ElementKey = (typeof ELEMENTS)[number];

export const WEAPONS = ["SWORD", "CLAYMORE", "POLEARM", "BOW", "CATALYST"] as const;
export type WeaponKey = (typeof WEAPONS)[number];

export const ELEMENT_META: Record<ElementKey, { label: string; color: string }> = {
  PYRO: { label: "Pyro", color: "#ef7a35" },
  HYDRO: { label: "Hydro", color: "#4cc2f1" },
  ANEMO: { label: "Anemo", color: "#5fd4b0" },
  ELECTRO: { label: "Electro", color: "#b98bf0" },
  DENDRO: { label: "Dendro", color: "#9fd03b" },
  CRYO: { label: "Cryo", color: "#9fe0f0" },
  GEO: { label: "Geo", color: "#f5b93a" },
};

export const WEAPON_LABEL: Record<WeaponKey, string> = {
  SWORD: "Espada",
  CLAYMORE: "Espadão",
  POLEARM: "Lança",
  BOW: "Arco",
  CATALYST: "Catalisador",
};

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

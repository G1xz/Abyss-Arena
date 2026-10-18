/**
 * Arte de corpo inteiro (gacha) a partir do ícone da yatta.moe:
 *   UI_AvatarIcon_Furina.png → UI_Gacha_AvatarImg_Furina.png (2048×1024, personagem ao centro).
 * Recortada na vertical, vira o retrato das cápsulas do draft. Outras fontes não têm equivalente.
 */
export function splashUrl(iconUrl: string | null): string | null {
  if (!iconUrl || !iconUrl.startsWith("https://gi.yatta.moe/assets/UI/UI_AvatarIcon_")) return null;
  return iconUrl.replace("UI_AvatarIcon_", "UI_Gacha_AvatarImg_");
}

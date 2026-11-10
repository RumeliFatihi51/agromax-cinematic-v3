export function cropModel(name) {
  const crop = name?.toLocaleLowerCase("tr-TR");
  if (crop?.includes("buğday") || /\bwheat\b/.test(crop || ""))
    return "/visuals/spatial-wheat.glb";
  if (crop?.includes("mısır") || /\b(corn|maize)\b/.test(crop || ""))
    return "/visuals/spatial-corn.glb";
  return null;
}

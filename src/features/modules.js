export const modules = [
  ["overview", "Genel bakış", "LayoutDashboard", "green"],
  ["fields", "Parseller ve analiz", "Sprout", "green"],
  ["history", "Analiz geçmişi", "History", "green"],
  ["weather", "Hava durumu", "CloudSun", "blue"],
  ["tasks", "Takvim & görevler", "CalendarDays", "orange"],
  ["operations", "Sezon ve saha", "Leaf", "green"],
  ["finance", "Maliyet yönetimi", "Wallet", "purple"],
  ["reports", "Raporlar", "ChartNoAxesCombined", "blue"],
  ["notifications", "Bildirimler", "Bell", "green"],
  ["assistant", "Filiz", "Sprout", "green"],
  ["integrations", "Veri bağlantıları", "Cable", "purple"],
  ["settings", "Hesap ve işletme", "ShieldCheck", "green"],
];

const legacyPages = new Set([
  "overview",
  "fields",
  "history",
  "weather",
  "tasks",
  "notifications",
  "assistant",
  "integrations",
]);
export const availableModules = (commercial = false) =>
  commercial ? modules : modules.filter(([id]) => legacyPages.has(id));
export const operationPages = [
  "seasons",
  "irrigation",
  "nutrition",
  "protection",
  "soil",
  "evaluations",
];
export const canonicalPage = (id) =>
  id === "satellite"
    ? "fields"
    : operationPages.includes(id)
      ? "operations"
      : id;

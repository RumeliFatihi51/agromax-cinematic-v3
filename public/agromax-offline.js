const key = "agromax-offline-v1";
const byId = (id) => document.getElementById(id);
let state;
try { state = JSON.parse(localStorage.getItem(key) || "null"); } catch {}

if (state?.field && Array.isArray(state.tasks) && Array.isArray(state.drafts)) {
  byId("workspace").hidden = false;
  byId("status").textContent = "Bu tarayıcıda saklanan saha özeti gösteriliyor.";
  byId("field").textContent = state.field.name;
  byId("summary").textContent = `${state.field.crop || "Ürün belirtilmedi"} · Sınır ve kayıt sürümü ${state.field.version}`;
  for (const task of state.tasks) {
    const item = document.createElement("li");
    item.textContent = `${task.date} · ${task.name}`;
    byId("tasks").append(item);
  }
  const updateCount = () => {
    byId("draft-count").textContent = `${state.drafts.length} eşitlenmemiş saha notu`;
  };
  updateCount();
  byId("note-form").elements.date.value = new Date().toISOString().slice(0, 10);
  byId("note-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const observation = String(values.get("observation") || "").trim();
    if (!observation) {
      byId("status").textContent = "Saha notunu yazın.";
      return;
    }
    try {
      const current = JSON.parse(localStorage.getItem(key) || "null");
      if (!current || current.userId !== state.userId || current.organizationId !== state.organizationId ||
        current.field.id !== state.field.id || current.field.version !== state.field.version)
        throw new Error("Bu çevrimdışı kopya değişti. Sayfayı yeniden açın.");
      if (current.drafts.length >= 20) throw new Error("Eşitlenmemiş 20 not sınırına ulaşıldı.");
      current.drafts.push({
        draftId: crypto.randomUUID().replaceAll("-", ""),
        date: String(values.get("date")), observation, fieldVersion: state.field.version,
      });
      localStorage.setItem(key, JSON.stringify(current));
      state = current;
      event.currentTarget.elements.observation.value = "";
      byId("status").textContent = "Saha notu taslak olarak kaydedildi.";
      updateCount();
    } catch (error) {
      byId("status").textContent = error.message || "Taslak kaydedilemedi.";
    }
  });
} else {
  byId("status").textContent = "Bu tarayıcıda kaydedilmiş çevrimdışı parsel yok.";
}

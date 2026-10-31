export const states = {
  queued: "Kuyrukta",
  running: "İşleniyor",
  completed: "Tamamlandı",
  failed: "Başarısız",
  canceled: "İptal edildi",
};
export const timestamp = (value) =>
  value
    ? new Date(value).toLocaleString("tr-TR", {
        timeZone: "Europe/Istanbul",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const gibs = (title, layer, zoom, resolution, note) => ({ title, layer, zoom, resolution, note, mode: "map" });
const cmr = (title, collection, resolution, note) => ({ title, collection, resolution, note, mode: "catalog" });

export const nasaProducts = {
  smap: gibs("SMAP · Yüzey toprak nemi", "SMAP_L3_Passive_Enhanced_Day_Soil_Moisture", 6, "9 km ızgara", "Sabah geçişi. Izgara aralığı sensörün etkin çözünürlüğünden daha küçüktür."),
  gpm: gibs("GPM IMERG · Yağış hızı", "IMERG_Precipitation_Rate", 6, "0,1° ızgara", "NASA yağış hızı görselleştirmesi. Günlük yağış toplamı veya parsel yağış ölçümü değildir."),
  modis: gibs("MODIS Terra · NDVI", "MODIS_Terra_L3_NDVI_16Day", 9, "250 m", "16 günlük bileşik gözlem. Tek çekim gününü temsil etmez."),
  modisHeat: gibs("MODIS Terra · Yüzey sıcaklığı", "MODIS_Terra_Land_Surface_Temp_Day", 7, "1 km", "Gündüz yüzey sıcaklığı. Bulutlu alanlar ve kapsama boşlukları olabilir."),
  viirs: gibs("VIIRS Suomi NPP · NDVI", "VIIRS_SNPP_NDVI_8Day", 8, "Yaklaşık 500 m", "8 günlük görselleştirme. Yerel parsel indeksiyle doğrudan kıyaslanmaz."),
  viirsHeat: gibs("VIIRS Suomi NPP · Yüzey sıcaklığı", "VIIRS_SNPP_Land_Surface_Temp_Day", 7, "750 m", "Gündüz yüzey sıcaklığı. Hava sıcaklığı değildir."),
  ecoHeat: cmr("ECOSTRESS · Yüzey sıcaklığı", "C3998139651-LPCLOUD", "70 m", "Anlık yüzey sıcaklığı. Bulut ve kalite maskesi sayısal analiz için gereklidir."),
  ecoEt: cmr("ECOSTRESS · Evapotranspirasyon", "C4057232489-LPCLOUD", "70 m", "Model tabanlı ET. Sulama miktarına doğrudan çevrilmez."),
  ecoStress: cmr("ECOSTRESS · Evaporatif stres", "C4057232495-LPCLOUD", "70 m", "Evaporatif stres indeksi. Tek başına bitki su stresi teşhisi değildir."),
  nisar: cmr("NISAR · Radar GCOV", "C3622241360-ASF", "Ürün ızgarasına göre", "Radar değişimi için aynı yörünge, frekans, polarizasyon ve hizalama gereklidir."),
  emit: cmr("EMIT · Yüzey yansıtımı", "C4079844428-LPCLOUD", "Yaklaşık 60 m", "ISS kapsaması düzensizdir. Hiperspektral analiz için kalite maskeleri ve dalga boyu bilgisi gerekir."),
};

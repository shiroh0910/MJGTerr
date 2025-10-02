/**
 * 国土地理院APIを使用してリバースジオコーディングを行う
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @returns {Promise<string>} 住所文字列
 */
export async function reverseGeocode(lat, lng) {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    if (json && json.results) {
      const { muniCd, lv01Nm } = json.results;
      if (muniCd && lv01Nm) {
        const cityMap = new Map([
          ['34213', '広島県廿日市市'],
          ['34211', '広島県大竹市'],
        ]);
        const baseAddress = cityMap.get(String(muniCd));
        if (baseAddress) {
          return baseAddress + lv01Nm;
        }
      }
      return json.results.lv01Nm || "住所が見つかりません";
    }
    return "住所が見つかりません";
  } catch (error) {
    throw new Error(`リバースジオコーディングに失敗しました: ${error.message}`);
  }
}

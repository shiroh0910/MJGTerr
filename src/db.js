import { openDB } from 'idb';

const DB_NAME = 'visit-pwa-db';
const DB_VERSION = 1;
const MARKERS_STORE = 'markers';
const BOUNDARIES_STORE = 'boundaries';

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(MARKERS_STORE)) {
      db.createObjectStore(MARKERS_STORE, { keyPath: 'address' });
    }
    if (!db.objectStoreNames.contains(BOUNDARIES_STORE)) {
      db.createObjectStore(BOUNDARIES_STORE, { keyPath: 'properties.areaNumber' });
    }
  },
});

/**
 * マーカーデータを取得する
 * @returns {Promise<Array<any>>}
 */
export async function getAllMarkers() {
  return (await dbPromise).getAll(MARKERS_STORE);
}

/**
 * 境界線データを取得する
 * @returns {Promise<Array<any>>}
 */
export async function getAllBoundaries() {
  return (await dbPromise).getAll(BOUNDARIES_STORE);
}

/**
 * 複数のマーカーデータを保存する
 * @param {Array<any>} markers
 */
export async function putAllMarkers(markers) {
  const db = await dbPromise;
  const tx = db.transaction(MARKERS_STORE, 'readwrite');
  await Promise.all(markers.map(marker => tx.store.put(marker)));
  await tx.done;
}

/**
 * 複数の境界線データを保存する
 * @param {Array<any>} boundaries
 */
export async function putAllBoundaries(boundaries) {
  const db = await dbPromise;
  const tx = db.transaction(BOUNDARIES_STORE, 'readwrite');
  await Promise.all(boundaries.map(boundary => tx.store.put(boundary)));
  await tx.done;
}

/**
 * マーカーを削除する
 * @param {string} address
 */
export async function deleteMarker(address) {
  const db = await dbPromise;
  await db.delete(MARKERS_STORE, address);
}

/**
 * 境界線を削除する
 * @param {string} areaNumber
 */
export async function deleteBoundary(areaNumber) {
  const db = await dbPromise;
  await db.delete(BOUNDARIES_STORE, areaNumber);
}
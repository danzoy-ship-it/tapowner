import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { NativeSyntheticEvent } from 'react-native';
import {
  Camera,
  Layer,
  Map,
  UserLocation,
  VectorSource,
} from '@maplibre/maplibre-react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { fetchParcelAt, type ParcelDetail } from './api';
import { ParcelSheet } from './ParcelSheet';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// TODO(Phase 9): move to the config service once it exists; this is an infra
// endpoint, not a tunable business value, so a constant is fine for now.
const API_BASE = 'https://api-production-7d11.up.railway.app';
const PARCEL_TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.mvt`;
const PARCEL_MIN_ZOOM = 16;

type PermissionState = 'checking' | 'granted' | 'denied';

export default function App() {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parcelDetail, setParcelDetail] = useState<ParcelDetail | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  async function handleParcelPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const { lngLat, features } = event.nativeEvent;
    const feature = features[0];
    const id = feature?.properties?.id;
    setSelectedId(typeof id === 'number' ? id : Number(id) || null);
    setParcelDetail(null);
    setLoadingParcel(true);
    try {
      const detail = await fetchParcelAt(lngLat[1], lngLat[0]);
      setParcelDetail(detail);
    } catch {
      setParcelDetail(null);
    } finally {
      setLoadingParcel(false);
    }
  }

  function closeSheet() {
    setSelectedId(null);
    setParcelDetail(null);
  }

  if (permission === 'checking') {
    return (
      <View style={styles.center}>
        <Text>Requesting location permission…</Text>
      </View>
    );
  }

  if (permission === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedText}>
          TapOwner uses your location to show properties around you. Enable
          location access in Settings to continue.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={OPENFREEMAP_STYLE}>
        <Camera trackUserLocation="default" initialViewState={{ zoom: 17 }} />
        <UserLocation />
        <VectorSource
          id="parcels"
          tiles={[PARCEL_TILE_URL]}
          minzoom={PARCEL_MIN_ZOOM}
          maxzoom={18}
          onPress={handleParcelPress}
        >
          <Layer
            id="parcels-fill"
            type="fill"
            source="parcels"
            source-layer="parcels"
            minzoom={PARCEL_MIN_ZOOM}
            paint={{
              'fill-color': '#2563eb',
              'fill-opacity': ['case', ['==', ['get', 'id'], selectedId ?? -1], 0.35, 0.03],
            }}
          />
          <Layer
            id="parcels-outline"
            type="line"
            source="parcels"
            source-layer="parcels"
            minzoom={PARCEL_MIN_ZOOM}
            paint={{ 'line-color': '#2563eb', 'line-width': 1.5, 'line-opacity': 0.85 }}
          />
        </VectorSource>
      </Map>

      {selectedId !== null && (
        <ParcelSheet loading={loadingParcel} detail={parcelDetail} onClose={closeSheet} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deniedText: {
    textAlign: 'center',
  },
});

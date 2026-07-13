import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { API_BASE, fetchParcelAt, type ParcelDetail } from './api';
import { ParcelSheet } from './ParcelSheet';
import { LoginScreen } from './LoginScreen';
import { clearToken, fetchMe, getStoredToken, storeToken, type Me } from './auth';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const PARCEL_TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.mvt`;
const PARCEL_MIN_ZOOM = 16;

type PermissionState = 'checking' | 'granted' | 'denied';
type AuthState = 'checking' | 'loggedOut' | 'loggedIn';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [me, setMe] = useState<Me | null>(null);
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

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (!token) {
        setAuthState('loggedOut');
        return;
      }
      const result = await fetchMe(token);
      if (result) {
        setMe(result);
        setAuthState('loggedIn');
      } else {
        await clearToken();
        setAuthState('loggedOut');
      }
    })();
  }, []);

  async function handleLoggedIn(token: string) {
    await storeToken(token);
    const result = await fetchMe(token);
    setMe(result);
    setAuthState('loggedIn');
  }

  async function handleLogout() {
    await clearToken();
    setMe(null);
    setAuthState('loggedOut');
  }

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

  if (authState === 'checking') {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (authState === 'loggedOut') {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
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

      <View style={styles.accountBar}>
        <Text style={styles.accountText}>
          {me?.email} · {me?.tier ?? 'no plan'}
        </Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

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
  accountBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  accountText: {
    fontSize: 13,
    color: '#374151',
  },
  logoutText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
});

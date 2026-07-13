import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import type { NativeSyntheticEvent } from 'react-native';
import {
  Camera,
  Layer,
  Map,
  UserLocation,
  VectorSource,
  type CameraRef,
  type TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import {
  API_BASE,
  FALLBACK_CONFIG,
  fetchConfig,
  fetchParcelAt,
  geocodeAddress,
  trackEvent,
  type AppConfig,
  type ParcelDetail,
} from './api';
import { ParcelSheet } from './ParcelSheet';
import { LoginScreen } from './LoginScreen';
import { SettingsScreen } from './SettingsScreen';
import { SavedPropertiesScreen } from './SavedPropertiesScreen';
import { UpgradeSheet } from './UpgradeSheet';
import { ExpiryScreen } from './ExpiryScreen';
import { clearToken, fetchMe, getStoredToken, storeToken, type Me } from './auth';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const PARCEL_TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.mvt`;
const PARCEL_MIN_ZOOM = 16;

type PermissionState = 'checking' | 'granted' | 'denied';
type AuthState = 'checking' | 'loggedOut' | 'loggedIn';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parcelDetail, setParcelDetail] = useState<ParcelDetail | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trackUser, setTrackUser] = useState<TrackUserLocation | undefined>('default');
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const cameraRef = useRef<CameraRef>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  useEffect(() => {
    // Config drives prices, templates, and feature gates; the bundled fallback
    // keeps the app usable if the fetch fails at launch.
    fetchConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const storedToken = await getStoredToken();
      if (!storedToken) {
        setAuthState('loggedOut');
        return;
      }
      const result = await fetchMe(storedToken);
      if (result) {
        setToken(storedToken);
        setMe(result);
        setAuthState('loggedIn');
        trackEvent(storedToken, 'app_open');
      } else {
        await clearToken();
        setAuthState('loggedOut');
      }
    })();
  }, []);

  async function handleLoggedIn(newToken: string) {
    await storeToken(newToken);
    const result = await fetchMe(newToken);
    setToken(newToken);
    setMe(result);
    setAuthState('loggedIn');
    trackEvent(newToken, 'app_open');
  }

  async function handleLogout() {
    await clearToken();
    setToken(null);
    setMe(null);
    setAuthState('loggedOut');
  }

  async function refreshMe() {
    if (!token) return;
    const result = await fetchMe(token);
    if (result) setMe(result);
  }

  const subscriptionUsable = me?.status === 'trialing' || me?.status === 'active';
  const tierFeatures = (me?.tier && config.tiers[me.tier]?.features) || {
    draft_email: false,
    crm: false,
  };

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

  async function handleSearch() {
    const query = searchText.trim();
    if (!query) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearchError(null);
    try {
      const result = await geocodeAddress(query);
      // Location tracking fights programmatic camera moves (it snaps the
      // camera back to the blue dot) -- turn it off before flying. The
      // actual flyTo happens in the effect below, after the prop change
      // has reached the native map.
      setTrackUser(undefined);
      setFlyTarget([result.lng, result.lat]);
      closeSheet();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Address search failed');
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!flyTarget) return;
    const timer = setTimeout(() => {
      cameraRef.current?.flyTo({ center: flyTarget, zoom: 17, duration: 1200 });
      setFlyTarget(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [flyTarget]);

  function handleRecenter() {
    setTrackUser('default');
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

  if (me && !subscriptionUsable) {
    return <ExpiryScreen config={config} onRecheck={refreshMe} onLogout={handleLogout} />;
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
        <Camera
          ref={cameraRef}
          trackUserLocation={trackUser}
          onTrackUserLocationChange={(e) =>
            setTrackUser(e.nativeEvent.trackUserLocation ?? undefined)
          }
          initialViewState={{ center: [-98.49, 29.42], zoom: 17 }}
        />
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
          <Layer
            id="parcels-labels"
            type="symbol"
            source="parcels"
            source-layer="parcels"
            minzoom={17}
            layout={{
              'text-field': ['get', 'label'],
              // Must be a stack the basemap's glyph server hosts (Noto only) --
              // the default (Open Sans/Arial Unicode) 404s and labels vanish.
              'text-font': ['Noto Sans Regular'],
              'text-size': 11,
              'text-anchor': 'center',
            }}
            paint={{
              'text-color': '#1e293b',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.2,
            }}
          />
        </VectorSource>
      </Map>

      <View style={styles.topBar}>
        <View style={styles.accountBar}>
          <Text style={styles.accountText} numberOfLines={1}>
            {me?.email} · {me?.tier ?? 'no plan'}
          </Text>
          <View style={styles.accountActions}>
            <TouchableOpacity
              onPress={() => (tierFeatures.crm ? setShowSaved(true) : setShowUpgrade(true))}
            >
              <Text style={styles.settingsText}>Saved</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Text style={styles.settingsText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search an address…"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={searching}>
            {searching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Go</Text>
            )}
          </TouchableOpacity>
        </View>
        {searchError && <Text style={styles.searchErrorText}>{searchError}</Text>}
      </View>

      {selectedId !== null && (
        <ParcelSheet
          loading={loadingParcel}
          detail={parcelDetail}
          token={token}
          config={config}
          features={tierFeatures}
          onUpgradeNeeded={() => setShowUpgrade(true)}
          onClose={closeSheet}
        />
      )}

      {!trackUser && selectedId === null && (
        <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
          <Text style={styles.recenterButtonText}>📍 My location</Text>
        </TouchableOpacity>
      )}

      {showUpgrade && <UpgradeSheet config={config} onClose={() => setShowUpgrade(false)} />}

      {showSettings && me && (
        <SettingsScreen
          token={token!}
          me={me}
          notice={config.data_broker_notice}
          onClose={() => setShowSettings(false)}
          onSaved={(profile) => setMe({ ...me, agent_profile: profile })}
        />
      )}

      {showSaved && token && (
        <SavedPropertiesScreen token={token} onClose={() => setShowSaved(false)} />
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
  topBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    gap: 8,
  },
  accountBar: {
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
    flexShrink: 1,
    marginRight: 10,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 14,
  },
  settingsText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  logoutText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
  },
  searchButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  searchErrorText: {
    color: '#b91c1c',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recenterButton: {
    position: 'absolute',
    bottom: 40,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  recenterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});

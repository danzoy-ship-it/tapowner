import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { API_BASE, fetchParcelAt, geocodeAddress, type ParcelDetail } from './api';
import { PropertyCard } from './PropertyCard';
import { useApp } from './AppContext';
import type { RootNav } from './navigation';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const PARCEL_TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.mvt`;
const PARCEL_MIN_ZOOM = 16;

export function MapScreen() {
  const navigation = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { config } = useApp();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parcelDetail, setParcelDetail] = useState<ParcelDetail | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trackUser, setTrackUser] = useState<TrackUserLocation | undefined>('default');
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const cameraRef = useRef<CameraRef>(null);
  const tapSeq = useRef(0);

  // Reflect the current location permission (without prompting) so the locate
  // button can offer "Enable location" instead of silently doing nothing.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setLocationDenied(status !== 'granted'))
      .catch(() => {});
  }, []);

  // Locate button: follow the user if we have permission; otherwise re-request
  // (prompts only the first time) and, if still blocked, open the OS Settings
  // so a previously-denied user has a real way to turn location back on.
  async function handleLocatePress() {
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (status === 'granted') {
      setLocationDenied(false);
      setTrackUser('default');
    } else {
      setLocationDenied(true);
      Linking.openSettings();
    }
  }

  async function handleParcelPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const { lngLat, features } = event.nativeEvent;
    const feature = features[0];
    const rawId = feature?.properties?.id;
    // A feature id of 0 is legitimate -- only null/undefined/NaN means "none".
    const parsedId = typeof rawId === 'number' ? rawId : Number(rawId);
    const id = Number.isFinite(parsedId) ? parsedId : null;
    setSelectedId(id);
    setParcelDetail(null);
    setLoadingParcel(true);
    // Guard against out-of-order responses: a slow tap-A landing after tap-B
    // must not overwrite tap-B's card with the wrong owner.
    const seq = ++tapSeq.current;
    try {
      const detail = await fetchParcelAt(lngLat[1], lngLat[0]);
      if (seq !== tapSeq.current) return;
      setParcelDetail(detail);
    } catch {
      if (seq !== tapSeq.current) return;
      setParcelDetail(null);
    } finally {
      if (seq === tapSeq.current) setLoadingParcel(false);
    }
  }

  function closeCard() {
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
      setTrackUser(undefined);
      setFlyTarget([result.lng, result.lat]);
      closeCard();
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

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={OPENFREEMAP_STYLE} onPress={() => Keyboard.dismiss()}>
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

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search an address…"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
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

      {selectedId === null && (!trackUser || locationDenied) && (
        <TouchableOpacity style={styles.recenterButton} onPress={handleLocatePress}>
          <Text style={styles.recenterButtonText}>
            {locationDenied ? '📍 Enable location' : '📍 My location'}
          </Text>
        </TouchableOpacity>
      )}

      {selectedId !== null && (
        <PropertyCard
          loading={loadingParcel}
          detail={parcelDetail}
          config={config}
          onClose={closeCard}
          onGetContact={(detail) => {
            navigation.navigate('Contact', {
              parcelId: detail.id,
              address: detail.situs_address,
              ownerName: detail.owner_name,
            });
          }}
        />
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
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
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
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recenterButton: {
    position: 'absolute',
    bottom: 24,
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

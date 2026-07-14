import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TransformRequestManager } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE, FALLBACK_CONFIG, fetchConfig, trackEvent, type AppConfig } from './api';
import { AppContext, type AppContextValue } from './AppContext';
import type { RootStackParamList } from './navigation';
import { MapScreen } from './MapScreen';
import { FarmResultsScreen } from './FarmResultsScreen';
import { PipelineScreen } from './PipelineScreen';
import { PipelineDetailScreen } from './PipelineDetailScreen';
import { AccountScreen } from './AccountScreen';
import { ContactScreen } from './ContactScreen';
import { DraftEmailScreen } from './DraftEmailScreen';
import { LoginScreen } from './LoginScreen';
import { UpgradeSheet } from './UpgradeSheet';
import { ErrorBoundary } from './ErrorBoundary';
import { clearToken, fetchMe, getStoredToken, storeToken, type Me } from './auth';

type AuthState = 'checking' | 'loggedOut' | 'loggedIn';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name !== 'Map',
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ color, size }) => {
          const icon =
            route.name === 'Map' ? 'map-outline' : route.name === 'Pipeline' ? 'list-outline' : 'person-circle-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen
        name="Pipeline"
        component={PipelineScreen}
        options={{ tabBarLabel: 'CRM', title: 'CRM' }}
      />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppInner() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  // Ask for location only once the user is logged in, so a brand-new user sees
  // the login screen first (not a location prompt over it). Denial never blocks
  // the app -- the map falls back to a default region + address search, and the
  // "Enable location" button on the map re-requests / opens Settings on demand.
  useEffect(() => {
    if (authState !== 'loggedIn') return;
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, [authState]);

  // C2: MapLibre fetches parcel tiles natively (outside our fetch code), so
  // attach the session token to those requests here. Matched STRICTLY to our
  // API host -- the basemap loads from OpenFreeMap and must never see our JWT.
  // Re-adding the same id updates in place (token refresh); removed on logout.
  useEffect(() => {
    // Plain string parse (RN's URL polyfill is unreliable and this runs at boot).
    const apiHost = API_BASE.replace(/^https?:\/\//, '').split('/')[0].replace(/\./g, '\\.');
    if (token) {
      TransformRequestManager.addHeader({
        id: 'tapowner-api-auth',
        match: apiHost,
        name: 'Authorization',
        value: `Bearer ${token}`,
      });
    } else {
      TransformRequestManager.removeHeader('tapowner-api-auth');
    }
  }, [token]);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
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
      } catch {
        // Network error during bootstrap (offline / API blip): never strand on
        // the "Loading…" screen -- fall to login so the user can retry rather
        // than see what looks like a frozen app. Stored token is left intact.
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

  const contextValue = useMemo<AppContextValue | null>(() => {
    if (!token) return null;
    // Features come from the tier ONLY while the subscription is usable -- a
    // canceled/past_due Closer keeps read-only access (below) but loses the
    // ability to trace, draft, or save.
    const usable = me?.status === 'trialing' || me?.status === 'active';
    const features = (usable && me?.tier && config.tiers[me.tier]?.features) || {
      draft_email: false,
      crm: false,
    };
    return {
      token,
      me,
      config,
      features,
      readOnly: !usable,
      refreshMe: async () => {
        const result = await fetchMe(token);
        if (result) setMe(result);
      },
      logout: async () => {
        await clearToken();
        setToken(null);
        setMe(null);
        setAuthState('loggedOut');
      },
      showUpgrade: () => setUpgradeVisible(true),
    };
  }, [token, me, config]);

  if (authState === 'checking') {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (authState === 'loggedOut' || !contextValue) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return (
    <AppContext.Provider value={contextValue}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="Contact"
            component={ContactScreen}
            options={{ title: 'Owner contact', headerBackTitle: 'Map' }}
          />
          <Stack.Screen
            name="DraftEmail"
            component={DraftEmailScreen}
            options={{ title: 'Draft email', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="PipelineDetail"
            component={PipelineDetailScreen}
            options={{ title: 'Saved property', headerBackTitle: 'CRM' }}
          />
          <Stack.Screen
            name="FarmResults"
            component={FarmResultsScreen}
            options={{ title: 'Farm area owners', headerBackTitle: 'Map' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      {upgradeVisible && <UpgradeSheet config={config} onClose={() => setUpgradeVisible(false)} />}
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});

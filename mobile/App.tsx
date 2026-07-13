import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { FALLBACK_CONFIG, fetchConfig, trackEvent, type AppConfig } from './api';
import { AppContext, type AppContextValue } from './AppContext';
import type { RootStackParamList } from './navigation';
import { MapScreen } from './MapScreen';
import { PipelineScreen } from './PipelineScreen';
import { PipelineDetailScreen } from './PipelineDetailScreen';
import { AccountScreen } from './AccountScreen';
import { ContactScreen } from './ContactScreen';
import { DraftEmailScreen } from './DraftEmailScreen';
import { LoginScreen } from './LoginScreen';
import { UpgradeSheet } from './UpgradeSheet';
import { ExpiryScreen } from './ExpiryScreen';
import { clearToken, fetchMe, getStoredToken, storeToken, type Me } from './auth';

type PermissionState = 'checking' | 'granted' | 'denied';
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
      <Tab.Screen name="Pipeline" component={PipelineScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  useEffect(() => {
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

  const contextValue = useMemo<AppContextValue | null>(() => {
    if (!token) return null;
    const features = (me?.tier && config.tiers[me.tier]?.features) || {
      draft_email: false,
      crm: false,
    };
    return {
      token,
      me,
      config,
      features,
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

  const subscriptionUsable = me?.status === 'trialing' || me?.status === 'active';
  if (me && !subscriptionUsable) {
    return (
      <ExpiryScreen
        config={config}
        onRecheck={contextValue.refreshMe}
        onLogout={contextValue.logout}
      />
    );
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
          TapOwner uses your location to show properties around you. Enable location access in
          Settings to continue.
        </Text>
      </View>
    );
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
            options={{ title: 'Saved property', headerBackTitle: 'Pipeline' }}
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
  deniedText: {
    textAlign: 'center',
  },
});

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FarmResult } from './api';

export type RootStackParamList = {
  Tabs: undefined;
  Contact: { parcelId: number; address: string | null; ownerName: string | null };
  DraftEmail: { parcelId: number; emails: string[] };
  PipelineDetail: { savedPropertyId: number };
  FarmResults: { polygon: [number, number][]; result: FarmResult };
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;

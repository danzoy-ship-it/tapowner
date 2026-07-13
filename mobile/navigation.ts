import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  Contact: { parcelId: number; address: string | null; ownerName: string | null };
  DraftEmail: { parcelId: number; emails: string[] };
  PipelineDetail: { savedPropertyId: number };
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;

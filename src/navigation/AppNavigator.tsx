import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { HomeScreen } from '@/screens/HomeScreen';
import { AskScreen } from '@/screens/AskScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { CaptureScreen } from '@/screens/CaptureScreen';

export type RootStackParamList = {
  Home: undefined;
  Ask: undefined;
  Capture: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        cardStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Ask" component={AskScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Capture" component={CaptureScreen} options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}

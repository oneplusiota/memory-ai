import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from '@/navigation/AppNavigator';
import type { RootStackParamList } from '@/navigation/AppNavigator';
import { loadAllProviderConfig } from '@/services/llm/ProviderConfig';
import { openEntryDB } from '@/services/db/EntryDB';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#7C3AED',
    secondary: '#6D28D9',
    background: '#FFFFFF',
    surface: '#FFFFFF',
  },
};

// memoryai://capture (the home-screen widget) opens the capture screen directly
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['memoryai://'],
  config: { screens: { Capture: 'capture' } },
};

export default function App() {
  useEffect(() => {
    loadAllProviderConfig();
    openEntryDB().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer linking={linking}>
            <StatusBar style="light" />
            <AppNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

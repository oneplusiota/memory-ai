import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from '@/navigation/AppNavigator';
import { loadAllProviderConfig } from '@/services/llm/ProviderConfig';
import { loadWebSearchConfig } from '@/services/tools/WebSearchClient';
import { openVaultDB } from '@/services/db/VaultDB';
import { isModelDownloaded, loadVocab } from '@/services/search/GloveService';

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

export default function App() {
  useEffect(() => {
    loadAllProviderConfig();
    loadWebSearchConfig();
    openVaultDB();
    // Auto-load GloVe vocab at startup if the model file is already downloaded
    isModelDownloaded().then(downloaded => { if (downloaded) loadVocab(); });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer>
            <StatusBar style="light" />
            <AppNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

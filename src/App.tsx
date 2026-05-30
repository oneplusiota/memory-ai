import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from '@/navigation/AppNavigator';
import { loadAllProviderConfig } from '@/services/gemini/GeminiClient';
import { loadWebSearchConfig } from '@/services/tools/WebSearchClient';
import { loadIndex } from '@/services/indexer/IndexStore';

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
    loadIndex();
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

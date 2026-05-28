import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConversationScreen } from '@/screens/ConversationScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ConfirmUpdateScreen } from '@/screens/ConfirmUpdateScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { ConversationDetailScreen } from '@/screens/ConversationDetailScreen';
import type { RoutingDecision } from '@/types';

export type RootStackParamList = {
  Conversation: undefined;
  Settings: undefined;
  Confirm: { decision: RoutingDecision; vaultUri: string; conversationFilePath?: string };
  History: undefined;
  ConversationDetail: { relativePath: string };
};

const Stack = createStackNavigator<RootStackParamList>();

function SettingsButton() {
  const nav = useNavigation();
  return (
    <TouchableOpacity onPress={() => nav.navigate('Settings' as never)} style={{ marginRight: 16 }}>
      <MaterialCommunityIcons name="cog" size={22} color="white" />
    </TouchableOpacity>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: true,
        cardStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings', headerRight: undefined }} />
      <Stack.Screen name="Confirm" component={ConfirmUpdateScreen} options={{ title: 'Confirm Update' }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Conversation History' }} />
      <Stack.Screen name="ConversationDetail" component={ConversationDetailScreen} options={{ title: 'Conversation' }} />
    </Stack.Navigator>
  );
}

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, Alert, TouchableOpacity, Platform } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/UI';
import { colors } from '../utils/theme';

// Auth screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// App screens
import QuotesScreen from '../screens/QuotesScreen';
import QuoteDetailScreen from '../screens/QuoteDetailScreen';
import QuotePreviewScreen from '../screens/QuotePreviewScreen';
import NewQuoteScreen from '../screens/NewQuoteScreen';
import ClientsScreen from '../screens/ClientsScreen';
import UsersScreen from '../screens/UsersScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import QuoteHeaderSettingsScreen from '../screens/QuoteHeaderSettingsScreen';
import QuoteFooterSettingsScreen from '../screens/QuoteFooterSettingsScreen';
import TimesheetScreen from '../screens/TimesheetScreen';
import MenuScreen from '../screens/MenuScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function QuotesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Quotes" component={QuotesScreen} options={{ title: 'Quotes', headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { fontWeight: '700' } }} />
      <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ title: 'Quote Detail', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="QuotePreview" component={QuotePreviewScreen} options={{ title: 'Preview PDF', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="NewQuote" component={NewQuoteScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'More Options', headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { fontWeight: '700' } }} />
      <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: 'Clients', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="Users" component={UsersScreen} options={{ title: 'Team Settings', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Settings', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ title: 'Business Settings', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="QuoteHeaderSettings" component={QuoteHeaderSettingsScreen} options={{ title: 'Quote Header Details', headerStyle: { backgroundColor: colors.surface } }} />
      <Stack.Screen name="QuoteFooterSettings" component={QuoteFooterSettingsScreen} options={{ title: 'Quote Footer Details', headerStyle: { backgroundColor: colors.surface } }} />
    </Stack.Navigator>
  );
}

function TabIcon({ emoji, focused }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
    </View>
  );
}

function AppNavigator() {
  const { logout } = useAuth();

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Logout', style: 'destructive', onPress: logout },
        ]
      );
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { borderTopColor: colors.border, paddingBottom: 4 },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="QuotesTab"
        component={QuotesStack}
        options={{ headerShown: false, title: 'Quotes', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }}
      />
      <Tab.Screen
        name="Timesheet"
        component={TimesheetScreen}
        options={{ title: 'Timesheet', tabBarIcon: ({ focused }) => <TabIcon emoji="⏱️" focused={focused} /> }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStack}
        options={{ headerShown: false, title: 'More', tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} /> }}
      />
      <Tab.Screen
        name="Logout"
        component={View}
        options={{
          title: 'Logout',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🚪" focused={focused} />,
          tabBarButton: (props) => (
            <TouchableOpacity 
              {...props} 
              onPress={handleLogout} 
            />
          )
        }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

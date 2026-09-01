import React, { useEffect } from 'react';
import { StatusBar, I18nManager } from 'react-native';
import * as Updates from 'expo-updates';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LangProvider, useLang } from './src/context/LangContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { RoleProvider } from './src/context/RoleContext';
import { t } from './src/i18n';

import LoginScreen            from './src/screens/LoginScreen';
import DashboardScreen        from './src/screens/DashboardScreen';
import ProjectsScreen         from './src/screens/ProjectsScreen';
import ProjectDetailScreen    from './src/screens/ProjectDetailScreen';
import ScopeDetailScreen      from './src/screens/ScopeDetailScreen';
import StageDetailScreen      from './src/screens/StageDetailScreen';
import PlanDetailScreen       from './src/screens/PlanDetailScreen';
import ApprovalsScreen        from './src/screens/ApprovalsScreen';
import ProfileScreen          from './src/screens/ProfileScreen';
import NotificationsScreen    from './src/screens/NotificationsScreen';
import ReportsScreen          from './src/screens/ReportsScreen';
import CreateProjectScreen    from './src/screens/CreateProjectScreen';
import CreateScopeScreen      from './src/screens/CreateScopeScreen';
import CreatePlanScreen       from './src/screens/CreatePlanScreen';
import CreatePlanItemScreen   from './src/screens/CreatePlanItemScreen';
import CreateUnitsRequestScreen from './src/screens/CreateUnitsRequestScreen';
import LoadingScreen          from './src/components/LoadingScreen';
import NotificationBell       from './src/components/NotificationBell';

// Internal (team) screens
import TeamHomeScreen              from './src/screens/internal/TeamHomeScreen';
import WeeklyScheduleScreen        from './src/screens/internal/WeeklyScheduleScreen';
import MyTasksScreen               from './src/screens/internal/MyTasksScreen';
import ManageTasksScreen           from './src/screens/internal/ManageTasksScreen';
import TeamScheduleScreen          from './src/screens/internal/TeamScheduleScreen';
import InternalNotificationsScreen from './src/screens/internal/InternalNotificationsScreen';
import TeamSetupScreen             from './src/screens/internal/TeamSetupScreen';
import ImplReportsScreen           from './src/screens/ImplReportsScreen';
import ActivityFeedScreen          from './src/screens/internal/ActivityFeedScreen';
import DailyLogScreen              from './src/screens/internal/DailyLogScreen';
import MyDashboardScreen           from './src/screens/internal/MyDashboardScreen';
import QuickExecutionScreen        from './src/screens/QuickExecutionScreen';
import QuickCreatePlanScreen      from './src/screens/QuickCreatePlanScreen';
import PlanPrintScreen            from './src/screens/PlanPrintScreen';
import ClientCloudAccessScreen    from './src/screens/ClientCloudAccessScreen';
import { InternalNotifProvider }   from './src/context/InternalNotifContext';

I18nManager.forceRTL(true);

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const BLUE = '#1565C0';

function MainTabs({ navigation }) {
  const { lang } = useLang();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: BLUE },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <NotificationBell navigation={navigation} />,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { borderTopColor: '#E0E0E0', backgroundColor: '#fff', height: 62, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'grid'              : 'grid-outline',
            Projects:  focused ? 'folder'            : 'folder-outline',
            MyPlan:    focused ? 'document-text'     : 'document-text-outline',
            Reports:   focused ? 'bar-chart'         : 'bar-chart-outline',
            Approvals: focused ? 'checkmark-circle'  : 'checkmark-circle-outline',
            Tools:     focused ? 'construct'         : 'construct-outline',
            Profile:   focused ? 'person'            : 'person-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: t('dashboard'), tabBarLabel: t('dashboard') }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ title: t('projects'), tabBarLabel: t('projects') }}
      />
      <Tab.Screen
        name="MyPlan"
        component={QuickCreatePlanScreen}
        options={{ title: 'إنشاء خطة', tabBarLabel: 'خطتي' }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: t('reports'), tabBarLabel: t('reports') }}
      />
      <Tab.Screen
        name="Approvals"
        component={ApprovalsScreen}
        options={{ title: t('approvals'), tabBarLabel: t('approvals') }}
      />
      <Tab.Screen
        name="Tools"
        component={ClientCloudAccessScreen}
        options={{ title: 'وصول عملاء الكلاود', tabBarLabel: 'الأدوات' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('profile'), tabBarLabel: t('profile') }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: BLUE },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: '',
          animation: 'slide_from_right',
        }}
      >
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: t('notifications') || 'الإشعارات' }}
            />
            <Stack.Screen
              name="ProjectDetail"
              component={ProjectDetailScreen}
              options={({ route }) => ({ title: route.params?.title || t('projectDetails') })}
            />
            <Stack.Screen
              name="ScopeDetail"
              component={ScopeDetailScreen}
              options={({ route }) => ({ title: route.params?.title || t('scopeDetails') })}
            />
            <Stack.Screen
              name="StageDetail"
              component={StageDetailScreen}
              options={({ route }) => ({ title: route.params?.title || t('stageDetails') })}
            />
            <Stack.Screen
              name="PlanDetail"
              component={PlanDetailScreen}
              options={({ route }) => ({ title: route.params?.title || t('planDetails') })}
            />
            <Stack.Screen
              name="CreateProject"
              component={CreateProjectScreen}
              options={{ title: t('newProject'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="CreateScope"
              component={CreateScopeScreen}
              options={{ title: t('newScope'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="CreatePlan"
              component={CreatePlanScreen}
              options={{ title: t('newPlan'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="CreatePlanItem"
              component={CreatePlanItemScreen}
              options={{ title: t('newPlanItem'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="CreateUnitsRequest"
              component={CreateUnitsRequestScreen}
              options={{ title: t('newUnitsRequest'), presentation: 'modal' }}
            />
            {/* Internal team screens */}
            <Stack.Screen
              name="WeeklySchedule"
              component={WeeklyScheduleScreen}
              options={{ title: 'جدولي الأسبوعي' }}
            />
            <Stack.Screen
              name="MyTasks"
              component={MyTasksScreen}
              options={{ title: 'مهامي' }}
            />
            <Stack.Screen
              name="ManageTasks"
              component={ManageTasksScreen}
              options={{ title: 'متابعة مهام الفريق' }}
            />
            <Stack.Screen
              name="TeamSchedule"
              component={TeamScheduleScreen}
              options={{ title: 'جدول الفريق' }}
            />
            <Stack.Screen
              name="InternalNotifications"
              component={InternalNotificationsScreen}
              options={{ title: 'إشعارات الفريق' }}
            />
            <Stack.Screen
              name="TeamSetup"
              component={TeamSetupScreen}
              options={{ title: 'إعداد الفريق' }}
            />
            <Stack.Screen
              name="ImplReports"
              component={ImplReportsScreen}
              options={{ title: 'تقارير التنفيذ' }}
            />
            <Stack.Screen
              name="ActivityFeed"
              component={ActivityFeedScreen}
              options={{ title: 'سجل النشاط' }}
            />
            <Stack.Screen
              name="DailyLog"
              component={DailyLogScreen}
              options={{ title: 'نشاطي اليومي' }}
            />
            <Stack.Screen
              name="MyDashboard"
              component={MyDashboardScreen}
              options={{ title: 'داشبورد إنجازاتي' }}
            />
            <Stack.Screen
              name="QuickExecution"
              component={QuickExecutionScreen}
              options={{ title: 'إضافة إجراء' }}
            />
            <Stack.Screen
              name="PlanPrint"
              component={PlanPrintScreen}
              options={{ title: 'طباعة الخطة' }}
            />
            <Stack.Screen
              name="ClientCloudAccess"
              component={ClientCloudAccessScreen}
              options={{ title: 'وصول عملاء الكلاود' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(function() {
    if (__DEV__) return;
    (async function() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (_) {}
    })();
  }, []);

  return (
    <LangProvider>
      <AuthProvider>
        <RoleProvider>
          <NotificationsProvider>
            <InternalNotifProvider>
              <AppNavigator />
            </InternalNotifProvider>
          </NotificationsProvider>
        </RoleProvider>
      </AuthProvider>
    </LangProvider>
  );
}

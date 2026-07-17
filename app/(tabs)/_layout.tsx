import { Tabs } from "expo-router"
import { useColorScheme } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? "#ffffff" : "#0a0a0a",
        tabBarInactiveTintColor: isDark ? "#666666" : "#999999",
        tabBarStyle: {
          backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
          borderTopColor: isDark ? "#1a1a1a" : "#e5e5e5",
        },
        headerStyle: {
          backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
        },
        headerTintColor: isDark ? "#ffffff" : "#0a0a0a",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.sessionsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: t("nav.connectionsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="server-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav.settingsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}

import { HapticTab } from "@/components/haptic-tab";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

const ACTIVE = "#604df6";
const INACTIVE = "#7b8296";

// Alt sekme menüsünde kullanılacak ikon isimleri burada tutulur.
// Bu anahtarlar app/(tabs) klasöründeki ekran dosyalarının route isimleriyle eşleşir.
const icons = {
  index: "home-variant",
  chat: "chat-processing",
  profile: "account-outline",
} as const;

export default function TabLayout() {
  return (
    <Tabs
      // Buradaki seçenekler tüm alt sekmeler için ortak görünüm ve davranışı belirler.
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 12,
          borderTopWidth: 0,
          backgroundColor: "#fff",
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
      }}
    >
      {/* index.tsx ana sayfa sekmesidir. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "home-variant" : icons.index}
              size={26}
              color={color}
            />
          ),
        }}
      />
      {/* chat.tsx sohbet sekmesidir. */}
      <Tabs.Screen
        name="chat"
        options={{
          title: "Sohbet",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name={icons.chat} size={26} color={color} />
          ),
        }}
      />
      {/* profile.tsx profil sekmesidir. */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name={icons.profile}
              size={26}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

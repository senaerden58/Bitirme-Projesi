import { HapticTab } from "@/components/haptic-tab";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

const ACTIVE = "#604df6";
const INACTIVE = "#7b8296";

const icons = {
  index: "home-variant",
  index1: "chat-processing",
  profile: "account-outline",
} as const;

export default function TabLayout() {
  return (
    <Tabs
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
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "home-variant" : icons.index} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index1"
        options={{
          title: "Sohbet",
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name={icons.index1} size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name={icons.profile} size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}

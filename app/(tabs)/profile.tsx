import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth, type ProfileUser } from "@/contexts/auth";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";
const RED = "#e25b73";

function getDevHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    "";

  return hostUri.split(":")[0] || "127.0.0.1";
}

const API_HOST = Platform.OS === "web" ? "127.0.0.1" : getDevHost();
const API_BASE_URL = `http://${API_HOST}:3000`;

type EmotionSummary = {
  counts?: Record<string, number>;
  topEmotion?: string;
  total?: number;
};

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  return data as T;
}

export default function ProfileScreen() {
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [summary, setSummary] = useState<EmotionSummary | null>(null);
  const [name, setName] = useState("Sena Erden");
  const [email, setEmail] = useState("sena@example.com");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const initials = useMemo(() => {
    const displayName = user?.name || name || "Kullanıcı";

    return displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
      .join("");
  }, [name, user?.name]);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }

    let ignore = false;
    const userId = user.id;

    async function loadSummary() {
      try {
        setIsLoadingSummary(true);
        const data = await requestJson<EmotionSummary>(
          `/users/${userId}/emotion-summary`,
        );

        if (!ignore) {
          setSummary(data);
        }
      } catch (error) {
        console.log("Profile summary error:", error);
      } finally {
        if (!ignore) {
          setIsLoadingSummary(false);
        }
      }
    }

    loadSummary();

    return () => {
      ignore = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return undefined;
      }

      let ignore = false;
      const userId = user.id;

      async function loadSummary() {
        try {
          setIsLoadingSummary(true);
          const data = await requestJson<EmotionSummary>(
            `/users/${userId}/emotion-summary`,
          );

          if (!ignore) {
            setSummary(data);
          }
        } catch (error) {
          console.log("Profile summary focus error:", error);
        } finally {
          if (!ignore) {
            setIsLoadingSummary(false);
          }
        }
      }

      loadSummary();

      return () => {
        ignore = true;
      };
    }, [user]),
  );

  const handleAuth = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || "Kullanıcı";

    if (!cleanEmail.includes("@")) {
      Alert.alert("E-posta gerekli", "Lütfen geçerli bir e-posta yaz.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Şifre kısa", "Şifre en az 6 karakter olmalı.");
      return;
    }

    try {
      setIsSubmitting(true);
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const data = await requestJson<{ user: ProfileUser }>(path, {
        method: "POST",
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanName,
          password,
        }),
      });

      setUser(data.user);
      setPassword("");
      Alert.alert(
        mode === "login" ? "Giriş yapıldı" : "Hesap oluşturuldu",
        "Profil Firebase üzerinden hazır.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Profil bağlantısı başarısız.";
      Alert.alert("İşlem başarısız", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setPassword("");
    Alert.alert("Çıkış yapıldı", "Oturum kapatıldı.");
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatar}>
          {user ? (
            <Text style={styles.initials}>{initials}</Text>
          ) : (
            <MaterialCommunityIcons
              name="account-heart"
              size={54}
              color={PURPLE}
            />
          )}
        </View>

        <Text style={styles.name}>{user?.name || "Profil"}</Text>
        <Text style={styles.subtitle}>
          {user
            ? user.email
            : "Giriş yaparak önerilerini kullanıcı hesabına bağla."}
        </Text>

        {!user ? (
          <View style={styles.card}>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  mode === "login" && styles.segmentActive,
                ]}
                onPress={() => setMode("login")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === "login" && styles.segmentTextActive,
                  ]}
                >
                  Giriş
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  mode === "register" && styles.segmentActive,
                ]}
                onPress={() => setMode("register")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === "register" && styles.segmentTextActive,
                  ]}
                >
                  Kayıt
                </Text>
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <View style={styles.field}>
                <Text style={styles.label}>Ad soyad</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Adını yaz"
                  placeholderTextColor="#9aa0b2"
                  style={styles.input}
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="ornek@mail.com"
                placeholderTextColor="#9aa0b2"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Şifre</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="En az 6 karakter"
                placeholderTextColor="#9aa0b2"
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isSubmitting && styles.disabledButton,
              ]}
              onPress={handleAuth}
              disabled={isSubmitting}
            >
              <MaterialCommunityIcons
                name={mode === "login" ? "login" : "account-plus-outline"}
                size={20}
                color="#fff"
              />
              <Text style={styles.primaryButtonText}>
                {isSubmitting
                  ? "Bağlanıyor..."
                  : mode === "login"
                    ? "Giriş yap"
                    : "Hesap oluştur"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Row
                icon="identifier"
                title="Kullanıcı ID"
                value={user.id.slice(0, 8)}
              />
              <Row
                icon="heart-pulse"
                title="En sık duygu"
                value={
                  isLoadingSummary
                    ? "Yükleniyor"
                    : summary?.topEmotion || "Neutral"
                }
              />
              <Row
                icon="chart-line"
                title="Kayıtlı analiz"
                value={`${summary?.total || 0}`}
              />
              <Row
                icon="database-outline"
                title="Kayıt alanı"
                value="Firebase"
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hesap işlemleri</Text>
              <Action
                icon="account-edit-outline"
                title="Profil düzenle"
                value="Yakında"
              />
              <Action
                icon="shield-check-outline"
                title="Gizlilik ve veriler"
                value="Firebase"
              />
              <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogout}
              >
                <MaterialCommunityIcons name="logout" size={21} color={RED} />
                <Text style={styles.logoutText}>Çıkış yap</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <TouchableOpacity style={styles.row}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon as any} size={23} color={PURPLE} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </TouchableOpacity>
  );
}

function Action({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <TouchableOpacity style={styles.actionRow}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon as any} size={23} color={PURPLE} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#f8f8ff" },
  content: {
    padding: 28,
    paddingTop: 74,
    paddingBottom: 116,
    alignItems: "center",
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 36,
    backgroundColor: "#eeeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: PURPLE, fontSize: 34, fontWeight: "900" },
  name: { color: INK, fontSize: 24, fontWeight: "900", marginTop: 22 },
  subtitle: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    alignSelf: "stretch",
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  cardTitle: {
    color: INK,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  segment: {
    height: 46,
    borderRadius: 16,
    backgroundColor: "#f1efff",
    flexDirection: "row",
    padding: 4,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: PURPLE },
  segmentText: { color: MUTED, fontSize: 13, fontWeight: "900" },
  segmentTextActive: { color: "#fff" },
  field: { marginBottom: 12 },
  label: { color: INK, fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: {
    height: 48,
    borderRadius: 15,
    backgroundColor: "#f7f5ff",
    paddingHorizontal: 14,
    color: INK,
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: PURPLE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  disabledButton: { opacity: 0.58 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  actionRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#eeeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { flex: 1, color: INK, fontSize: 15, fontWeight: "800" },
  rowValue: { color: MUTED, fontSize: 13, fontWeight: "700" },
  logoutButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#fff0f3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  logoutText: { color: RED, fontSize: 14, fontWeight: "900" },
});

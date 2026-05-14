import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";
const RED = "#e25b73";

type ProfileUser = {
  email: string;
  name: string;
};

export default function ProfileScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [name, setName] = useState("Sena Erden");
  const [email, setEmail] = useState("sena@example.com");
  const [password, setPassword] = useState("");

  const initials = useMemo(() => {
    const displayName = user?.name || name || "Kullanıcı";
    return displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
      .join("");
  }, [name, user?.name]);

  const handleAuth = () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || "Kullanıcı";

    if (!cleanEmail.includes("@")) {
      Alert.alert("E-posta gerekli", "Lütfen geçerli bir e-posta adresi yaz.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Şifre kısa", "Şifre en az 6 karakter olmalı.");
      return;
    }

    setUser({ email: cleanEmail, name: cleanName });
    setPassword("");
    Alert.alert(mode === "login" ? "Giriş yapıldı" : "Hesap oluşturuldu", "Profil oturumu hazır. Firebase Auth bağlanınca bu işlem kalıcı olacak.");
  };

  const handleLogout = () => {
    setUser(null);
    setPassword("");
    Alert.alert("Çıkış yapıldı", "Oturum kapatıldı.");
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          {user ? <Text style={styles.initials}>{initials}</Text> : <MaterialCommunityIcons name="account-heart" size={54} color={PURPLE} />}
        </View>

        <Text style={styles.name}>{user?.name || "Profil"}</Text>
        <Text style={styles.subtitle}>{user ? user.email : "Giriş yaparak önerilerini kişisel hale getir."}</Text>

        {!user ? (
          <View style={styles.card}>
            <View style={styles.segment}>
              <TouchableOpacity style={[styles.segmentButton, mode === "login" && styles.segmentActive]} onPress={() => setMode("login")}>
                <Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>Giriş</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segmentButton, mode === "register" && styles.segmentActive]} onPress={() => setMode("register")}>
                <Text style={[styles.segmentText, mode === "register" && styles.segmentTextActive]}>Kayıt</Text>
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <View style={styles.field}>
                <Text style={styles.label}>Ad soyad</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Adını yaz" placeholderTextColor="#9aa0b2" style={styles.input} />
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

            <TouchableOpacity style={styles.primaryButton} onPress={handleAuth}>
              <MaterialCommunityIcons name={mode === "login" ? "login" : "account-plus-outline"} size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Row icon="calendar-check" title="Bugünkü durum" value="Dengeli" />
              <Row icon="heart-pulse" title="En sık duygu" value="Neutral" />
              <Row icon="chart-line" title="Haftalık analiz" value="Yakında" />
              <Row icon="database-outline" title="Kayıt alanı" value="Kişiye göre" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hesap işlemleri</Text>
              <Action icon="account-edit-outline" title="Profili düzenle" value="Yakında" />
              <Action icon="shield-check-outline" title="Gizlilik ve veriler" value="Yakında" />
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <MaterialCommunityIcons name="logout" size={21} color={RED} />
                <Text style={styles.logoutText}>Çıkış yap</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={22} color={PURPLE} />
          <Text style={styles.infoText}>Firebase Auth bağlandığında sohbetler, günlükler, hedefler ve öneriler bu kullanıcı hesabına göre ayrılacak.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ icon, title, value }: { icon: string; title: string; value: string }) {
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

function Action({ icon, title, value }: { icon: string; title: string; value: string }) {
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
  content: { padding: 28, paddingTop: 74, paddingBottom: 116, alignItems: "center" },
  avatar: { width: 108, height: 108, borderRadius: 36, backgroundColor: "#eeeaff", alignItems: "center", justifyContent: "center" },
  initials: { color: PURPLE, fontSize: 34, fontWeight: "900" },
  name: { color: INK, fontSize: 24, fontWeight: "900", marginTop: 22 },
  subtitle: { color: MUTED, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: "center" },
  card: { alignSelf: "stretch", marginTop: 24, backgroundColor: "#fff", borderRadius: 20, padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  cardTitle: { color: INK, fontSize: 16, fontWeight: "900", marginBottom: 8, paddingHorizontal: 4 },
  segment: { height: 46, borderRadius: 16, backgroundColor: "#f1efff", flexDirection: "row", padding: 4, marginBottom: 14 },
  segmentButton: { flex: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: PURPLE },
  segmentText: { color: MUTED, fontSize: 13, fontWeight: "900" },
  segmentTextActive: { color: "#fff" },
  field: { marginBottom: 12 },
  label: { color: INK, fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: { height: 48, borderRadius: 15, backgroundColor: "#f7f5ff", paddingHorizontal: 14, color: INK, fontSize: 14 },
  primaryButton: { height: 48, borderRadius: 16, backgroundColor: PURPLE, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 10 },
  actionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 10 },
  rowIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#eeeaff", alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, color: INK, fontSize: 15, fontWeight: "800" },
  rowValue: { color: MUTED, fontSize: 13, fontWeight: "700" },
  logoutButton: { minHeight: 52, borderRadius: 16, backgroundColor: "#fff0f3", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  logoutText: { color: RED, fontSize: 14, fontWeight: "900" },
  infoBox: { alignSelf: "stretch", marginTop: 18, borderRadius: 18, backgroundColor: "#f0efff", flexDirection: "row", gap: 10, padding: 14 },
  infoText: { flex: 1, color: INK, fontSize: 12, lineHeight: 18, fontWeight: "700" },
});

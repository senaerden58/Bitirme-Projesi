import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";

export default function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.avatar}>
        <MaterialCommunityIcons name="account-heart" size={54} color={PURPLE} />
      </View>
      <Text style={styles.name}>Sena Erden</Text>
      <Text style={styles.subtitle}>Duygu takip profili</Text>

      <View style={styles.card}>
        <Row icon="calendar-check" title="Bugunku durum" value="Dengeli" />
        <Row icon="heart-pulse" title="En sik duygu" value="Neutral" />
        <Row icon="chart-line" title="Haftalik analiz" value="Yakinda" />
      </View>
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f8ff", padding: 28, paddingTop: 74, alignItems: "center" },
  avatar: { width: 108, height: 108, borderRadius: 36, backgroundColor: "#eeeaff", alignItems: "center", justifyContent: "center" },
  name: { color: INK, fontSize: 24, fontWeight: "900", marginTop: 22 },
  subtitle: { color: MUTED, fontSize: 14, marginTop: 6 },
  card: { alignSelf: "stretch", marginTop: 34, backgroundColor: "#fff", borderRadius: 22, padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 10 },
  rowIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#eeeaff", alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, color: INK, fontSize: 15, fontWeight: "800" },
  rowValue: { color: MUTED, fontSize: 13, fontWeight: "700" },
});

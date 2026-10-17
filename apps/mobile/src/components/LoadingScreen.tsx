import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useResolvedDark } from "@/providers/ThemePreference";
import { phaseoWordmarkXml } from "@/assets/phaseoWordmark";
import { colour, space } from "@/theme";

export function LoadingScreen() {
  const dark = useResolvedDark();

  return (
    <View style={[styles.container, { backgroundColor: dark ? colour.black : colour.white }]}>
      <SvgXml
        accessibilityLabel="Phaseo"
        xml={phaseoWordmarkXml(dark)}
        width={240}
        height={50}
      />
      <ActivityIndicator color={colour.blue} size="small" style={styles.indicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  indicator: { marginTop: space.xl },
});

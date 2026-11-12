import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

// A bare sideways list loses its drags to the phone's sidebar drawer; HorizontalScroll locks the drawer's swipe.
const sidewaysList = {
  selector: "JSXOpeningElement:has(JSXAttribute[name.name='horizontal'])[name.name=/^(ScrollView|FlatList|LegendList)$/]",
  message: "Use HorizontalScroll from @/components/ui for sideways rows, so the sidebar drawer's swipe doesn't take their drags.",
};

export default defineConfig([
  ...expoConfig,
  { ignores: ["dist/**"] },
  { files: ["**/*.tsx"], ignores: ["src/components/ui/horizontal-scroll.tsx"], rules: { "no-restricted-syntax": ["error", sidewaysList] } },
]);
